"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { cleanRut, isValidRut } from "@/lib/rut";
import { ESTADOS_CIVILES, PREGUNTAS_273A, lvsProgress, type LvsFicha } from "@/lib/lvs";
import { ESTADOS_REQUISITO, type LvsRequisito, type RequisitoEstado } from "@/lib/lvs-requisitos";
import { syncRequisitos } from "@/lib/lvs-sync";
import type { UploadedFile } from "@/lib/upload-client";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const text = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max) || null;
const yesNo = (fd: FormData, k: string): boolean | null => {
  const v = fd.get(k);
  return v === "si" ? true : v === "no" ? false : null;
};
const oneOf = <T extends readonly string[]>(v: string | null, list: T) => (v && (list as readonly string[]).includes(v) ? v : null);

const revalidate = (id: string) => {
  revalidatePath("/documentos/lvs");
  revalidatePath(`/documentos/lvs/${id}`);
  revalidatePath(`/clientes/${id}`);
};

/** Abre el expediente LVS de un cliente que ya existe en Jurídico. */
export async function createLvs(clientId: string): Promise<Result & { id?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.create")) return { error: "No tienes permiso para crear expedientes." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  const { data: client } = await supabase.from("legal_clients").select("id, procedure_type, archived_at").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Cliente no encontrado." };
  if (client.archived_at) return { error: "La causa está cerrada: reábrela antes de abrir el expediente." };
  const { error } = await supabase.from("legal_lvs").insert({ client_id: clientId });
  if (error && !/duplicate key/.test(error.message)) return { error: error.message };
  if (!client.procedure_type) await supabase.from("legal_clients").update({ procedure_type: "Liquidación voluntaria" }).eq("id", clientId);
  await syncRequisitos(supabase, clientId);
  revalidate(clientId);
  return { id: clientId };
}

/** Nueva solicitud LVS para un cliente que todavía no está en Jurídico: crea el cliente y abre su expediente. */
export async function createLvsClient(fd: FormData): Promise<Result & { id?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.create")) return { error: "No tienes permiso para crear expedientes." };
  const full_name = text(fd, "full_name");
  if (!full_name) return { error: "Indica el nombre completo." };
  const rutRaw = text(fd, "rut", 20);
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT no tiene un formato o dígito verificador válido." };
  const email = text(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El email no es válido." };
  const rut = rutRaw ? cleanRut(rutRaw) : null;
  if (rut) {
    const { data: dup } = await supabase.from("legal_clients").select("id, full_name").eq("rut", rut).is("archived_at", null).maybeSingle();
    if (dup) return { error: `Ese RUT ya es de ${dup.full_name}: ábrele el expediente desde la lista de clientes existentes.` };
  }
  const { data, error } = await supabase
    .from("legal_clients")
    .insert({ full_name, rut, phone: text(fd, "phone", 40), email, procedure_type: "Liquidación voluntaria" })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const ins = await supabase.from("legal_lvs").insert({ client_id: data.id });
  if (ins.error) return { error: ins.error.message };
  await syncRequisitos(supabase, data.id as string);
  revalidatePath("/clientes");
  revalidate(data.id);
  return { id: data.id as string };
}

/** Guarda la Ficha Maestra: datos del cliente (legal_clients) y de la LVS (legal_lvs) en una sola pasada. */
export async function saveLvs(clientId: string, fd: FormData): Promise<Result & { pct?: number }> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };

  const full_name = text(fd, "full_name");
  if (!full_name) return { error: "Indica el nombre completo." };
  const rutRaw = text(fd, "rut", 20);
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT no tiene un formato o dígito verificador válido." };
  const email = text(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El email no es válido." };
  const rutEmp = text(fd, "rut_empleador", 20);
  if (rutEmp && !isValidRut(rutEmp)) return { error: "El RUT del empleador no es válido." };
  const genero = text(fd, "genero", 1);
  if (genero && genero !== "F" && genero !== "M") return { error: "Género no válido." };
  const relacion = yesNo(fd, "relacion_laboral");

  const lvs: Partial<LvsFicha> = {
    genero: (genero as "F" | "M" | null) ?? null,
    nacionalidad: text(fd, "nacionalidad", 60) ?? "chilena",
    estado_civil: oneOf(text(fd, "estado_civil", 40), ESTADOS_CIVILES),
    profesion_oficio: text(fd, "profesion_oficio"),
    domicilio: text(fd, "domicilio", 300),
    comuna: text(fd, "comuna", 80),
    region: text(fd, "region", 80),
    relacion_laboral: relacion,
    empleador: relacion ? text(fd, "empleador") : null,
    rut_empleador: relacion && rutEmp ? cleanRut(rutEmp) : null,
    comuna_tribunal: text(fd, "comuna_tribunal", 80),
    // Si no se escribe el encabezado, se arma con la comuna del tribunal (se puede corregir después)
    sj_comuna: text(fd, "sj_comuna", 200) ?? (text(fd, "comuna_tribunal", 80) ? `S.J.L. Civil de ${text(fd, "comuna_tribunal", 80)}` : null),
    carta_original: text(fd, "carta_original", 20000),
    carta_demanda: text(fd, "carta_demanda", 20000),
  };
  for (const q of PREGUNTAS_273A) lvs[q.key] = yesNo(fd, q.key);

  const cli = await supabase
    .from("legal_clients")
    .update({ full_name, rut: rutRaw ? cleanRut(rutRaw) : null, phone: text(fd, "phone", 40), email })
    .eq("id", clientId);
  if (cli.error) return { error: cli.error.message };

  const { data: saved, error } = await supabase.from("legal_lvs").update(lvs).eq("client_id", clientId).select("*").single();
  if (error) return { error: error.message };

  // El estado avanza solo de «borrador» a «ficha completa» (y vuelve si se borra algo); los demás los ponen etapas posteriores
  const { pct } = lvsProgress(saved as LvsFicha, { full_name, rut: rutRaw ? cleanRut(rutRaw) : null });
  const estado = saved.estado as LvsFicha["estado"];
  if (pct === 100 && estado === "borrador") await supabase.from("legal_lvs").update({ estado: "ficha_completa" }).eq("client_id", clientId);
  else if (pct < 100 && estado === "ficha_completa") await supabase.from("legal_lvs").update({ estado: "borrador" }).eq("client_id", clientId);

  await syncRequisitos(supabase, clientId, saved as LvsFicha);
  revalidate(clientId);
  revalidatePath("/clientes");
  return { pct };
}

/* ---------------- Documentación requerida ---------------- */

/** Registra el archivo subido al bucket como documento de la causa y lo enlaza al requisito (estado «recibido»). */
export async function uploadRequisito(clientId: string, reqId: string, up: UploadedFile): Promise<Result> {
  const { supabase, can, user } = await getContext();
  if (!can("documents.upload") || !can("legal.edit")) return { error: "No tienes permiso para subir documentos." };
  if (!isUuid(clientId) || !isUuid(reqId)) return { error: "Datos no válidos." };
  if (!up.path.startsWith(`${clientId}/`)) return { error: "Ruta de archivo no válida." };
  const { data: req } = await supabase.from("legal_lvs_requisitos").select("*").eq("id", reqId).eq("client_id", clientId).maybeSingle();
  if (!req) return { error: "Requisito no encontrado." };
  if (req.generado) return { error: "Este documento lo genera la app; no se sube." };
  const version = req.document_id ? 2 : 1;
  const { data: doc, error } = await supabase
    .from("legal_documents")
    .insert({ client_id: clientId, name: req.nombre, status: "recibido", storage_path: up.path, file_size: up.size, mime: up.mime, replaces_id: req.document_id, version })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (req.document_id) await supabase.from("legal_documents").update({ is_current: false, status: "reemplazado" }).eq("id", req.document_id);
  const upd = await supabase
    .from("legal_lvs_requisitos")
    .update({ document_id: doc.id, estado: "recibido", fecha_carga: new Date().toISOString(), cargado_por: user.id })
    .eq("id", reqId);
  if (upd.error) return { error: upd.error.message };
  revalidate(clientId);
  return {};
}

/** Estado, fecha de emisión u observación de un requisito. Aprobado y observado guardan quién revisó y cuándo. */
export async function setRequisito(clientId: string, reqId: string, input: { estado?: RequisitoEstado; fecha_emision?: string | null; observacion?: string | null }): Promise<Result> {
  const { supabase, can, user } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId) || !isUuid(reqId)) return { error: "Datos no válidos." };
  const patch: Partial<LvsRequisito> = {};
  if (input.estado !== undefined) {
    if (!(input.estado in ESTADOS_REQUISITO)) return { error: "Estado no válido." };
    patch.estado = input.estado;
    if (input.estado === "aprobado" || input.estado === "observado") {
      patch.fecha_revision = new Date().toISOString();
      patch.revisado_por = user.id;
    }
  }
  if (input.fecha_emision !== undefined) {
    if (input.fecha_emision && !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha_emision)) return { error: "Fecha de emisión no válida." };
    patch.fecha_emision = input.fecha_emision || null;
  }
  if (input.observacion !== undefined) patch.observacion = input.observacion?.trim().slice(0, 500) || null;
  if (!Object.keys(patch).length) return {};
  const { error } = await supabase.from("legal_lvs_requisitos").update(patch).eq("id", reqId).eq("client_id", clientId);
  if (error) return { error: error.message };
  revalidate(clientId);
  return {};
}

/** Documento extra que pide el tribunal o el abogado para este expediente. */
export async function addRequisitoManual(clientId: string, nombre: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  const name = nombre.trim().slice(0, 160);
  if (!name) return { error: "Indica el nombre del documento." };
  const codigo = `manual_${Date.now().toString(36)}`;
  const { error } = await supabase.from("legal_lvs_requisitos").insert({ client_id: clientId, codigo, nombre: name, origen: "manual", orden: 9000 });
  if (error) return { error: error.message };
  revalidate(clientId);
  return {};
}

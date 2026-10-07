"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { cleanRut, isValidRut } from "@/lib/rut";
import { ESTADOS_CIVILES, PREGUNTAS_273A, lvsProgress, type LvsFicha } from "@/lib/lvs";

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

/**
 * Elimina la solicitud LVS (ficha, bienes, juicios, deudas y documentos generados). La causa sigue en Clientes.
 * La base borra las filas (función legal_lvs_delete, solo documents.manage) y devuelve las rutas de los Word del
 * almacén interno, que se borran aquí. En el Drive no se toca nada.
 */
export async function deleteLvs(clientId: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.manage")) return { error: "Solo el administrador elimina solicitudes LVS." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  const { data, error } = await supabase.rpc("legal_lvs_delete", { p_client_id: clientId });
  if (error) return { error: error.message };
  const paths = ((data ?? []) as string[]).filter(Boolean);
  if (paths.length) await supabase.storage.from("legal-documents").remove(paths);
  revalidate(clientId);
  revalidatePath("/clientes");
  return {};
}

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
    nacionalidad: text(fd, "nacionalidad", 60) ?? "Chilena",
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

  revalidate(clientId);
  revalidatePath("/clientes");
  return { pct };
}

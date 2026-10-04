import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { LegalClient } from "./data";
import { renderDocx } from "./docx";
import type { LvsFicha } from "./lvs";
import { TIPOS_BIEN_MUEBLE, type BienRow } from "./lvs-bienes";
import { totalDeudas, type Deuda } from "./lvs-acreedores";
import { lvsValues } from "./lvs";
import { clientValues } from "./templates";
import { DOCX_MIME, TEMPLATE_BUCKET } from "./templates";
import { formatRut } from "./rut";

import { GENERADOS, type GeneradoTipo } from "./lvs-generados";
export { GENERADOS, type GeneradoTipo, type LvsGenerado } from "./lvs-generados";

const pesos = (v: unknown) => (typeof v === "number" ? `$ ${v.toLocaleString("es-CL")}` : "");
const siNo = (v: unknown) => (v ? "SI" : "NO");
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().replace(/\s+/g, "-");

/** Datos del Anexo 8 a partir de la ficha y los bienes muebles. Errores = no se puede generar; advertencias = se genera igual. */
export function datosAnexo8(c: LegalClient, f: LvsFicha, bienes: BienRow[], lawyer: string | null) {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!c.full_name?.trim()) errores.push("Falta el nombre del cliente.");
  if (!c.rut) errores.push("Falta el RUT del cliente.");
  if (f.tiene_bienes_muebles !== true) errores.push("La ficha no declara otros bienes muebles o financieros (art. 273 A n.º 1).");
  if (bienes.length === 0) errores.push("No hay bienes cargados en la pestaña Bienes.");
  bienes.forEach((b, i) => {
    if (!b.tipo_codigo) errores.push(`Bien ${i + 1}: falta el tipo (código del Anexo 8).`);
    if (!b.datos) advertencias.push(`Bien ${i + 1}: sin descripción («Datos del bien»).`);
    if (b.monto == null) advertencias.push(`Bien ${i + 1}: sin monto o valor.`);
  });
  const data = {
    ...clientValues(c, lawyer),
    ...lvsValues(f),
    bienes: bienes.map((b) => ({
      tipo: b.tipo_codigo ? `${b.tipo_codigo}` : "",
      tipo_nombre: b.tipo_codigo ? (TIPOS_BIEN_MUEBLE[Number(b.tipo_codigo)] ?? "") : "",
      datos: String(b.datos ?? ""),
      marca_modelo: String(b.marca_modelo ?? ""),
      cantidad: String(b.cantidad ?? ""),
      monto: pesos(b.monto),
      estado_conservacion: String(b.estado_conservacion ?? ""),
      direccion: String(b.direccion ?? f.domicilio ?? ""),
      excluido: siNo(b.excluido) + (b.excluido && b.motivo_exclusion ? ` · ${b.motivo_exclusion}` : ""),
      gravamen: siNo(b.gravamen) + (b.gravamen && b.gravamen_detalle ? ` · ${b.gravamen_detalle}` : ""),
      observaciones: String(b.observaciones ?? ""),
    })),
  };
  return { data, errores, advertencias };
}

/** Datos del Anexo 9: una fila por deuda con lo que pide el formulario y el total calculado. */
export function datosAnexo9(c: LegalClient, f: LvsFicha, deudas: Deuda[], lawyer: string | null) {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!c.full_name?.trim()) errores.push("Falta el nombre del cliente.");
  if (!c.rut) errores.push("Falta el RUT del cliente.");
  if (deudas.length === 0) errores.push("No hay deudas cargadas en la ficha (bloque Acreedores).");
  deudas.forEach((d, i) => {
    if (d.monto == null) errores.push(`Deuda ${i + 1} (${d.nombre}): falta el monto.`);
    if (!d.rut) advertencias.push(`${d.nombre}: sin RUT.`);
    if (!d.email && !d.telefono) advertencias.push(`${d.nombre}: sin correo ni teléfono.`);
  });
  const data = {
    ...clientValues(c, lawyer),
    ...lvsValues(f),
    deudas: deudas.map((d) => ({
      rut: d.rut ? formatRut(d.rut) : "",
      acreedor: d.nombre,
      monto: pesos(d.monto),
      correo: d.email ?? "",
      telefono: d.telefono ?? "",
      naturaleza: d.naturaleza,
    })),
    total: pesos(totalDeudas(deudas)),
  };
  return { data, errores, advertencias };
}

/** Datos de la Declaración 273-A: todo sale de la ficha; sin alguno de estos no se genera. */
export function datosDeclaracion(c: LegalClient, f: LvsFicha, lawyer: string | null) {
  const errores: string[] = [];
  const falta = (ok: unknown, que: string) => {
    if (!ok) errores.push(`Falta ${que} en la ficha.`);
  };
  falta(c.full_name?.trim(), "el nombre");
  falta(c.rut, "el RUT");
  falta(f.genero, "el género (don/doña, domiciliado/a)");
  falta(f.profesion_oficio, "la profesión u oficio");
  falta(f.nacionalidad, "la nacionalidad");
  falta(f.estado_civil, "el estado civil");
  falta(f.domicilio, "el domicilio");
  falta(f.comuna, "la comuna");
  falta(f.region, "la región");
  const data = { ...clientValues(c, lawyer), ...lvsValues(f) };
  return { data, errores, advertencias: [] as string[] };
}

/**
 * Genera un documento LVS: toma la plantilla del slot, la rellena, guarda el Word en el bucket de documentos de la
 * causa, lo registra como documento (y como generado).
 * Si ya había una versión, la anterior pasa a «reemplazado».
 */
export async function generarDocumento(supabase: SupabaseClient, userId: string, c: LegalClient, tipo: GeneradoTipo, data: Record<string, unknown>, advertencias: string[]): Promise<{ error?: string; id?: string }> {
  const { data: tpl } = await supabase.from("legal_templates").select("id, version, storage_path, name").eq("slot", tipo).eq("active", true).maybeSingle();
  if (!tpl) return { error: `No hay plantilla cargada para «${GENERADOS[tipo].nombre}». Súbela en Plantillas con el papel ${tipo}.` };
  const dl = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.storage_path);
  if (dl.error || !dl.data) return { error: `No se pudo leer la plantilla: ${dl.error?.message ?? "sin archivo"}` };
  let out: Buffer;
  try {
    out = renderDocx(Buffer.from(await dl.data.arrayBuffer()), data);
  } catch (e) {
    return { error: `La plantilla no se pudo rellenar: ${(e as Error).message}` };
  }
  const fileName = `${GENERADOS[tipo].nombre.split(" · ")[0]} - ${slug(c.full_name)}${c.rut ? ` ${formatRut(c.rut)}` : ""}.docx`;
  const path = `${c.id}/generados/${randomUUID()}.docx`;
  const up = await supabase.storage.from("legal-documents").upload(path, out, { contentType: DOCX_MIME, cacheControl: "0", upsert: false });
  if (up.error) return { error: `No se pudo guardar el Word: ${up.error.message}` };

  const { data: prev } = await supabase.from("legal_lvs_generados").select("id, document_id").eq("client_id", c.id).eq("tipo", tipo).neq("estado", "reemplazado").order("generado_at", { ascending: false }).limit(1).maybeSingle();
  const { data: doc, error: docErr } = await supabase
    .from("legal_documents")
    .insert({ client_id: c.id, name: GENERADOS[tipo].nombre, doc_type: tipo, status: "preparado", storage_path: path, file_size: out.length, mime: DOCX_MIME, version: 1, replaces_id: prev?.document_id ?? null })
    .select("id")
    .single();
  if (docErr) return { error: docErr.message };
  const { data: gen, error } = await supabase
    .from("legal_lvs_generados")
    .insert({ client_id: c.id, tipo, template_id: tpl.id, template_version: tpl.version, document_id: doc.id, storage_path: path, file_name: fileName, replaces_id: prev?.id ?? null, datos: data, advertencias, generado_por: userId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (prev) {
    await supabase.from("legal_lvs_generados").update({ estado: "reemplazado" }).eq("id", prev.id);
    if (prev.document_id) await supabase.from("legal_documents").update({ is_current: false, status: "reemplazado" }).eq("id", prev.document_id);
  }
  return { id: gen.id as string };
}

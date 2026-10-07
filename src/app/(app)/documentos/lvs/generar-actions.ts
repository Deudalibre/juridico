"use server";

import { revalidatePath } from "next/cache";
import { getContext, type LegalClient } from "@/lib/data";
import type { LvsFicha } from "@/lib/lvs";
import type { BienCategoriaKey, BienRow } from "@/lib/lvs-bienes";
import { ANEXO_CATEGORIA, GENERADOS, type GeneradoTipo } from "@/lib/lvs-generados";
import { CATEGORIAS } from "@/lib/lvs-bienes";
import { datosAnexo8, datosAnexo9, datosAnexoBienes, datosDeclaracion, datosDemanda, generarDocumento, nombreArchivo, renderizarLvs } from "@/lib/lvs-generar";
import type { Deuda } from "@/lib/lvs-acreedores";
import { DOCX_MIME } from "@/lib/templates";
import type { SupabaseClient } from "@supabase/supabase-js";

type Result = { error?: string; advertencias?: string[] };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Reúne ficha, bienes y deudas y calcula los datos del documento. Lo comparten la vista previa y la generación. */
async function prepararLvs(supabase: SupabaseClient, clientId: string, tipo: GeneradoTipo): Promise<{ error?: string; c?: LegalClient; data?: Record<string, unknown>; advertencias?: string[] }> {
  // Tablas de bienes que alimentan este documento: una para los anexos 3 a 8, todas para la demanda, ninguna para el resto
  const categoria = tipo === "anexo8" ? "muebles" : ANEXO_CATEGORIA[tipo];
  const cats = tipo === "demanda_lvs" ? CATEGORIAS : categoria ? CATEGORIAS.filter((x) => x.key === categoria) : [];
  const [{ data: client }, { data: lvs }, filas, { data: deudas }] = await Promise.all([
    supabase.from("legal_clients").select("*").eq("id", clientId).maybeSingle(),
    supabase.from("legal_lvs").select("*").eq("client_id", clientId).maybeSingle(),
    Promise.all(cats.map((cat) => supabase.from(cat.table).select("*").eq("client_id", clientId).order("orden"))),
    tipo === "anexo9" ? supabase.from("legal_lvs_deudas").select("*").eq("client_id", clientId).order("orden") : Promise.resolve({ data: [] as Deuda[] }),
  ]);
  if (!client || !lvs) return { error: "Expediente no encontrado." };
  const c = client as LegalClient;
  let lawyer: string | null = null;
  if (c.lawyer_id) lawyer = (await supabase.from("profiles").select("full_name").eq("id", c.lawyer_id).maybeSingle()).data?.full_name ?? null;
  const f = lvs as LvsFicha;
  const porCategoria: Partial<Record<BienCategoriaKey, BienRow[]>> = {};
  cats.forEach((cat, i) => {
    porCategoria[cat.key] = (filas[i].data ?? []) as BienRow[];
  });
  const rows = (categoria ? porCategoria[categoria] : []) ?? [];
  const { data, errores, advertencias } =
    tipo === "anexo8" ? datosAnexo8(c, f, rows, lawyer)
    : tipo === "anexo9" ? datosAnexo9(c, f, (deudas ?? []) as Deuda[], lawyer)
    : tipo === "declaracion_273a" ? datosDeclaracion(c, f, lawyer)
    : tipo === "demanda_lvs" ? datosDemanda(c, f, porCategoria, lawyer)
    : datosAnexoBienes(tipo, c, f, rows, lawyer);
  if (errores.length) return { error: errores.join(" ") };
  return { c, data, advertencias };
}

/** Genera un documento de la LVS (anexos 3 a 9, Declaración 273-A, Solicitud). Con errores no genera; con advertencias genera y las guarda. */
export async function generarLvs(clientId: string, tipo: GeneradoTipo): Promise<Result & { driveLink?: string | null }> {
  const { supabase, can, user } = await getContext();
  if (!can("documents.edit") || !can("legal.edit")) return { error: "No tienes permiso para generar documentos." };
  if (!isUuid(clientId) || !(tipo in GENERADOS)) return { error: "Datos no válidos." };
  const p = await prepararLvs(supabase, clientId, tipo);
  if (p.error || !p.c || !p.data) return { error: p.error ?? "No se pudo preparar el documento." };
  const r = await generarDocumento(supabase, user.id, p.c, tipo, p.data, p.advertencias ?? []);
  if (r.error) return { error: r.error };
  revalidatePath(`/documentos/lvs/${clientId}`);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/documentos");
  return { advertencias: r.advertencias ?? p.advertencias, driveLink: r.driveLink ?? null };
}

/**
 * Vista previa (lupa): rellena la plantilla con los datos de la ficha y deja el Word en una carpeta temporal del
 * almacén (no se registra como generado ni va al Drive). Devuelve un enlace de dos minutos para que el navegador lo
 * dibuje con docx-preview tal como va a quedar. Las vistas previas anteriores del cliente se borran en cada llamada.
 * (La solicitud pesa casi 3 MB: por eso va por enlace y no dentro de la respuesta de la acción.)
 */
export async function previsualizarLvs(clientId: string, tipo: GeneradoTipo): Promise<Result & { url?: string; fileName?: string }> {
  const { supabase, can } = await getContext();
  if (!can("documents.view") || !can("documents.edit")) return { error: "Sin permiso." };
  if (!isUuid(clientId) || !(tipo in GENERADOS)) return { error: "Datos no válidos." };
  const p = await prepararLvs(supabase, clientId, tipo);
  if (p.error || !p.c || !p.data) return { error: p.error ?? "No se pudo preparar el documento." };
  const r = await renderizarLvs(supabase, tipo, p.data);
  if (r.error || !r.out) return { error: r.error ?? "No se pudo rellenar la plantilla." };
  const bucket = supabase.storage.from("legal-documents");
  const dir = `${clientId}/previsualizaciones`;
  const { data: viejas } = await bucket.list(dir, { limit: 100 });
  if (viejas?.length) await bucket.remove(viejas.map((f) => `${dir}/${f.name}`));
  const path = `${dir}/${tipo}-${Date.now().toString(36)}.docx`;
  const up = await bucket.upload(path, r.out, { contentType: DOCX_MIME, cacheControl: "0", upsert: true });
  if (up.error) return { error: `No se pudo preparar la vista previa: ${up.error.message}` };
  const { data, error } = await bucket.createSignedUrl(path, 120);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la vista previa." };
  return { url: data.signedUrl, fileName: nombreArchivo(p.c, tipo), advertencias: p.advertencias };
}

// (Marcar final / volver a borrador se quitó el 2026-10-06: era doble trabajo; si no gusta, se genera de nuevo.)

/** Enlace temporal de descarga del Word generado. */
export async function generadoUrl(clientId: string, id: string): Promise<Result & { url?: string }> {
  const { supabase, can } = await getContext();
  if (!can("documents.view")) return { error: "Sin permiso." };
  if (!isUuid(clientId) || !isUuid(id)) return { error: "Datos no válidos." };
  const { data: g } = await supabase.from("legal_lvs_generados").select("storage_path, file_name").eq("id", id).eq("client_id", clientId).maybeSingle();
  if (!g) return { error: "Documento no encontrado." };
  const { data, error } = await supabase.storage.from("legal-documents").createSignedUrl(g.storage_path, 120, { download: g.file_name });
  if (error || !data) return { error: error?.message ?? "No se pudo generar el enlace." };
  return { url: data.signedUrl };
}

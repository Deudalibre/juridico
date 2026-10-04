"use server";

import { revalidatePath } from "next/cache";
import { getContext, type LegalClient } from "@/lib/data";
import type { LvsFicha } from "@/lib/lvs";
import type { BienRow } from "@/lib/lvs-bienes";
import { ANEXO_CATEGORIA, GENERADOS, type GeneradoTipo } from "@/lib/lvs-generados";
import { CATEGORIAS } from "@/lib/lvs-bienes";
import { datosAnexo8, datosAnexo9, datosAnexoBienes, datosDeclaracion, generarDocumento } from "@/lib/lvs-generar";
import type { Deuda } from "@/lib/lvs-acreedores";

type Result = { error?: string; advertencias?: string[] };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Genera un documento de la LVS (anexos 3 a 9, Declaración 273-A). Con errores no genera; con advertencias genera y las guarda. */
export async function generarLvs(clientId: string, tipo: GeneradoTipo): Promise<Result> {
  const { supabase, can, user } = await getContext();
  if (!can("documents.edit") || !can("legal.edit")) return { error: "No tienes permiso para generar documentos." };
  if (!isUuid(clientId) || !(tipo in GENERADOS)) return { error: "Datos no válidos." };
  if (tipo === "demanda_lvs") return { error: `«${GENERADOS[tipo].nombre}» se genera en la etapa ${GENERADOS[tipo].etapa}.` };
  // Tabla de bienes que alimenta este documento (anexos 3 a 8); los demás no cargan bienes
  const categoria = tipo === "anexo8" ? "muebles" : ANEXO_CATEGORIA[tipo];
  const tablaBienes = categoria ? CATEGORIAS.find((x) => x.key === categoria)?.table : undefined;
  const [{ data: client }, { data: lvs }, { data: bienes }, { data: deudas }] = await Promise.all([
    supabase.from("legal_clients").select("*").eq("id", clientId).maybeSingle(),
    supabase.from("legal_lvs").select("*").eq("client_id", clientId).maybeSingle(),
    tablaBienes ? supabase.from(tablaBienes).select("*").eq("client_id", clientId).order("orden") : Promise.resolve({ data: [] as BienRow[] }),
    tipo === "anexo9" ? supabase.from("legal_lvs_deudas").select("*").eq("client_id", clientId).order("orden") : Promise.resolve({ data: [] as Deuda[] }),
  ]);
  if (!client || !lvs) return { error: "Expediente no encontrado." };
  const c = client as LegalClient;
  let lawyer: string | null = null;
  if (c.lawyer_id) lawyer = (await supabase.from("profiles").select("full_name").eq("id", c.lawyer_id).maybeSingle()).data?.full_name ?? null;
  const f = lvs as LvsFicha;
  const rows = (bienes ?? []) as BienRow[];
  const { data, errores, advertencias } =
    tipo === "anexo8" ? datosAnexo8(c, f, rows, lawyer)
    : tipo === "anexo9" ? datosAnexo9(c, f, (deudas ?? []) as Deuda[], lawyer)
    : tipo === "declaracion_273a" ? datosDeclaracion(c, f, lawyer)
    : datosAnexoBienes(tipo, c, f, rows, lawyer);
  if (errores.length) return { error: errores.join(" ") };
  const r = await generarDocumento(supabase, user.id, c, tipo, data, advertencias);
  if (r.error) return { error: r.error };
  revalidatePath(`/documentos/lvs/${clientId}`);
  revalidatePath(`/clientes/${clientId}`);
  return { advertencias };
}

/** Marca una versión como final (o la devuelve a borrador). */
export async function setGeneradoEstado(clientId: string, id: string, estado: "borrador" | "final"): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar documentos." };
  if (!isUuid(clientId) || !isUuid(id)) return { error: "Datos no válidos." };
  const { error } = await supabase.from("legal_lvs_generados").update({ estado }).eq("id", id).eq("client_id", clientId).neq("estado", "reemplazado");
  if (error) return { error: error.message };
  revalidatePath(`/documentos/lvs/${clientId}`);
  return {};
}

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

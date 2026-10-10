import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actuacion, Cuaderno, Parte } from "@/lib/pjud";

/** Una fila de pjud_causa_data: la última lectura de la Oficina Judicial Virtual para una causa. */
export type PjudCausaData = {
  client_id: string;
  rol: string;
  tribunal: string;
  tribunal_codigo: number | null;
  caratulado: string | null;
  fecha_ingreso: string | null;
  estado_adm: string | null;
  estado_proc: string | null;
  procedimiento: string | null;
  etapa: string | null;
  ubicacion: string | null;
  partes: Parte[];
  cuadernos: Cuaderno[];
  actuaciones: number;
  ultima_actuacion: string | null;
  synced_at: string | null;
  error: string | null;
  error_at: string | null;
  peticiones: number | null;
  /** PDFs ya bajados a Vercel Blob (pjud_documentos); lo rellena loadPjud. */
  documentos?: PjudDocumento[];
};

/** Una fila de pjud_documentos: el PDF de una actuación (tipo actuacion/certificado, con cuaderno y folio) o de la cabecera (demanda, certificado_demanda, ebook; cuaderno '' y folio 0). */
export type PjudDocumento = {
  id: string;
  client_id: string;
  cuaderno: string;
  folio: number;
  /** actuacion = documento; certificado = certificado de envío del escrito; anexo = carpeta «Anexo» del folio; anexo_causa = carpeta de la cabecera */
  tipo: "actuacion" | "certificado" | "anexo" | "anexo_causa" | "demanda" | "certificado_demanda" | "ebook";
  /** Distingue varios documentos del mismo folio y tipo (0 el primero) */
  orden: number;
  referencia: string | null;
  fecha: string | null;
  estado: "downloading" | "done" | "error";
  blob_url: string | null;
  size_bytes: number | null;
  error_msg: string | null;
  downloaded_at: string;
};

export type { Actuacion, Cuaderno, Parte };

export async function loadPjud(supabase: SupabaseClient, clientId: string): Promise<PjudCausaData | null> {
  const [{ data }, { data: docs }] = await Promise.all([
    supabase.from("pjud_causa_data").select("*").eq("client_id", clientId).maybeSingle(),
    supabase.from("pjud_documentos").select("id, client_id, cuaderno, folio, tipo, orden, referencia, fecha, estado, blob_url, size_bytes, error_msg, downloaded_at").eq("client_id", clientId).order("orden"),
  ]);
  if (!data) return null;
  return { ...(data as PjudCausaData), documentos: (docs ?? []) as PjudDocumento[] };
}

/** Índice de los documentos por (tipo, cuaderno, folio): una búsqueda por fila en vez de recorrer cientos de documentos. */
export type IndiceDocs = Map<string, PjudDocumento[]>;
const claveDoc = (tipo: string, cuaderno: string, folio: number) => `${tipo}|${cuaderno}|${folio}`;
export function indexarDocumentos(docs: PjudDocumento[] | undefined): IndiceDocs {
  const m: IndiceDocs = new Map();
  for (const d of docs ?? []) {
    const k = claveDoc(d.tipo, d.cuaderno, d.folio);
    const l = m.get(k);
    if (l) l.push(d);
    else m.set(k, [d]);
  }
  for (const l of m.values()) l.sort((a, b) => a.orden - b.orden);
  return m;
}

/** El documento n-ésimo (orden) de un folio y tipo (o de la cabecera: cuaderno '' y folio 0) entre los ya bajados. */
export function documentoDe(idx: IndiceDocs, tipo: PjudDocumento["tipo"], cuaderno = "", folio = 0, orden = 0): PjudDocumento | undefined {
  return idx.get(claveDoc(tipo, cuaderno, folio))?.find((d) => d.orden === orden);
}

/** Todos los documentos de un folio y tipo, en orden (las carpetas de anexos). */
export function documentosDe(idx: IndiceDocs, tipo: PjudDocumento["tipo"], cuaderno = "", folio = 0): PjudDocumento[] {
  return idx.get(claveDoc(tipo, cuaderno, folio)) ?? [];
}

/** Una causa no se sincroniza a mano más de una vez cada 6 horas (el cron diario no tiene este límite). */
export const PJUD_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Si la causa sigue en cooldown: cuánto falta y cuándo vuelve a estar disponible; null si ya se puede sincronizar. */
export function pjudCooldown(syncedAt: string | null | undefined, ahora = Date.now()): { restante_ms: number; next_available: string } | null {
  if (!syncedAt) return null;
  const desde = Date.parse(syncedAt);
  if (!Number.isFinite(desde)) return null;
  const restante = desde + PJUD_COOLDOWN_MS - ahora;
  return restante > 0 ? { restante_ms: restante, next_available: new Date(desde + PJUD_COOLDOWN_MS).toISOString() } : null;
}

/** «2026-10-07» → «07/10/2026» (sin zona horaria: son fechas civiles del PJUD). */
export const fechaPjud = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** «Actualizado hace 3 horas» a partir de synced_at. */
export function haceCuanto(iso: string | null | undefined, ahora = Date.now()): string {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((ahora - Date.parse(iso)) / 60000));
  if (min < 2) return "recién";
  if (min < 60) return `hace ${min} minutos`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `hace ${d} días`;
}

/** Tono del estado procesal, como los colores del PJUD: verde en tramitación, gris terminada/concluida, ámbar el resto. */
export function tonoEstado(estado: string | null | undefined): "verde" | "gris" | "ambar" {
  const s = (estado ?? "").toLowerCase();
  if (!s) return "ambar";
  if (s.includes("tramit")) return "verde";
  if (s.includes("termin") || s.includes("conclu") || s.includes("archiv")) return "gris";
  return "ambar";
}

export const ROTULO_PARTE: Record<Parte["tipo"], string> = {
  demandante: "Demandante",
  demandado: "Demandado",
  deudor: "Deudor",
  acreedor: "Acreedor",
  liquidador: "Liquidador",
  abogado_demandante: "Abogado demandante",
  abogado_demandado: "Abogado demandado",
  abogado_deudor: "Abogado del deudor",
  abogado_acreedor: "Abogado del acreedor",
  otro: "Otro",
};

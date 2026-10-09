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
};

export type { Actuacion, Cuaderno, Parte };

export async function loadPjud(supabase: SupabaseClient, clientId: string): Promise<PjudCausaData | null> {
  const { data } = await supabase.from("pjud_causa_data").select("*").eq("client_id", clientId).maybeSingle();
  return (data as PjudCausaData | null) ?? null;
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

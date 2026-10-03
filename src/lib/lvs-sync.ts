import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LvsFicha } from "./lvs";
import { requisitosPara, type LvsRequisito } from "./lvs-requisitos";

/**
 * Alinea los documentos requeridos del expediente con lo que dice la Ficha Maestra. Idempotente:
 * crea los que faltan (pendientes), marca «no aplica» los que ya no corresponden y no tienen archivo,
 * y vuelve a activar los que reaparecen. Nunca borra filas con archivo ni las añadidas a mano.
 */
export async function syncRequisitos(supabase: SupabaseClient, clientId: string, ficha?: LvsFicha | null): Promise<void> {
  const f = ficha ?? ((await supabase.from("legal_lvs").select("*").eq("client_id", clientId).maybeSingle()).data as LvsFicha | null);
  if (!f) return;
  const defs = requisitosPara(f);
  const { data } = await supabase.from("legal_lvs_requisitos").select("*").eq("client_id", clientId).is("entidad_id", null);
  const rows = (data ?? []) as LvsRequisito[];
  const byCode = new Map(rows.map((r) => [r.codigo, r]));
  const wanted = new Set(defs.map((d) => d.codigo));

  const inserts = defs
    .filter((d) => !byCode.has(d.codigo))
    .map((d, i) => ({ client_id: clientId, codigo: d.codigo, nombre: d.nombre, origen: d.origen, regla: d.regla, vigencia_dias: d.vigencia_dias, generado: d.generado, orden: defs.indexOf(d) * 10 + i }));
  if (inserts.length) await supabase.from("legal_lvs_requisitos").insert(inserts);

  for (const d of defs) {
    const r = byCode.get(d.codigo);
    if (!r) continue;
    const patch: Partial<LvsRequisito> = {};
    if (r.estado === "no_aplica" && r.origen !== "manual") patch.estado = r.document_id ? "recibido" : "pendiente";
    if (r.orden !== defs.indexOf(d) * 10) patch.orden = defs.indexOf(d) * 10;
    if (r.regla !== d.regla) patch.regla = d.regla;
    if (Object.keys(patch).length) await supabase.from("legal_lvs_requisitos").update(patch).eq("id", r.id);
  }
  for (const r of rows) {
    if (r.origen === "manual" || wanted.has(r.codigo) || r.estado === "no_aplica") continue;
    if (r.document_id) continue; // tiene archivo: lo decide una persona
    await supabase.from("legal_lvs_requisitos").update({ estado: "no_aplica", observacion: r.observacion ?? "Ya no corresponde según la ficha" }).eq("id", r.id);
  }
}

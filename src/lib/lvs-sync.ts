import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LvsFicha } from "./lvs";
import { CATEGORIAS, type BienRow } from "./lvs-bienes";
import { requisitosPara, type LvsRequisito, type RequisitoDef } from "./lvs-requisitos";

const key = (codigo: string, entidadId: string | null) => `${codigo}|${entidadId ?? ""}`;

/**
 * Alinea los documentos requeridos del expediente con la Ficha Maestra y con los bienes registrados. Idempotente:
 * crea los que faltan (pendientes), marca «no aplica» los que ya no corresponden y no tienen archivo, y vuelve a
 * activar los que reaparecen. Nunca borra filas con archivo ni las añadidas a mano.
 * Mientras una categoría con documento de dominio (vehículos, inmuebles) no tenga bienes cargados se exige uno
 * genérico; en cuanto hay bienes, se exige uno por cada bien y el genérico deja de aplicar.
 */
export async function syncRequisitos(supabase: SupabaseClient, clientId: string, ficha?: LvsFicha | null): Promise<void> {
  const f = ficha ?? ((await supabase.from("legal_lvs").select("*").eq("client_id", clientId).maybeSingle()).data as LvsFicha | null);
  if (!f) return;

  // Bienes por categoría con documento propio
  const conDoc = CATEGORIAS.filter((c) => c.requisito);
  const bienes = await Promise.all(conDoc.map(async (c) => ({ c, rows: (f[c.pregunta] ? ((await supabase.from(c.table).select("*").eq("client_id", clientId)).data ?? []) : []) as BienRow[] })));

  const defs: (RequisitoDef & { entidad_tipo?: string; entidad_id?: string })[] = [];
  for (const d of requisitosPara(f)) {
    const cat = conDoc.find((c) => c.requisito!.codigo === d.codigo);
    const rows = cat ? bienes.find((b) => b.c === cat)!.rows : [];
    if (cat && rows.length > 0) {
      for (const r of rows) defs.push({ ...d, nombre: cat.requisito!.nombre(r), regla: cat.requisito!.regla, entidad_tipo: cat.key, entidad_id: r.id });
    } else defs.push(d);
  }

  const { data } = await supabase.from("legal_lvs_requisitos").select("*").eq("client_id", clientId);
  const rows = (data ?? []) as LvsRequisito[];
  const existing = new Map(rows.map((r) => [key(r.codigo, r.entidad_id), r]));
  const wanted = new Set(defs.map((d) => key(d.codigo, d.entidad_id ?? null)));

  const inserts = defs
    .filter((d) => !existing.has(key(d.codigo, d.entidad_id ?? null)))
    .map((d) => ({
      client_id: clientId,
      codigo: d.codigo,
      nombre: d.nombre,
      origen: d.origen,
      regla: d.regla,
      vigencia_dias: d.vigencia_dias,
      generado: d.generado,
      entidad_tipo: d.entidad_tipo ?? null,
      entidad_id: d.entidad_id ?? null,
      orden: defs.indexOf(d) * 10,
    }));
  if (inserts.length) await supabase.from("legal_lvs_requisitos").insert(inserts);

  for (const d of defs) {
    const r = existing.get(key(d.codigo, d.entidad_id ?? null));
    if (!r) continue;
    const patch: Partial<LvsRequisito> = {};
    if (r.estado === "no_aplica" && r.origen !== "manual") patch.estado = r.document_id ? "recibido" : "pendiente";
    const orden = defs.indexOf(d) * 10;
    if (r.orden !== orden) patch.orden = orden;
    if (r.regla !== d.regla) patch.regla = d.regla;
    if (r.nombre !== d.nombre) patch.nombre = d.nombre;
    if (Object.keys(patch).length) await supabase.from("legal_lvs_requisitos").update(patch).eq("id", r.id);
  }
  for (const r of rows) {
    if (r.origen === "manual" || wanted.has(key(r.codigo, r.entidad_id)) || r.estado === "no_aplica") continue;
    if (r.document_id) continue; // tiene archivo: lo decide una persona
    await supabase.from("legal_lvs_requisitos").update({ estado: "no_aplica", observacion: r.observacion ?? "Ya no corresponde según la ficha" }).eq("id", r.id);
  }
}

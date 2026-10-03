"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { categoria, type BienField } from "@/lib/lvs-bienes";
import { syncRequisitos } from "@/lib/lvs-sync";
import { cleanRut, isValidRut } from "@/lib/rut";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Convierte lo que llega del formulario según el tipo declarado del campo (y rechaza lo que no cuadra). */
function parseField(f: BienField, raw: FormDataEntryValue | null): { value: unknown } | { error: string } {
  const s = String(raw ?? "").trim();
  switch (f.type) {
    case "bool":
      return { value: s === "si" };
    case "number": {
      if (!s) return { value: null };
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) ? { value: n } : { error: `«${f.label}» debe ser un número.` };
    }
    case "money": {
      if (!s) return { value: null };
      const n = Number(s.replace(/[^\d]/g, ""));
      return Number.isInteger(n) && n >= 0 && n < 1e15 ? { value: n } : { error: `«${f.label}» debe ser un monto en pesos.` };
    }
    case "date":
      if (!s) return { value: null };
      return isDate(s) ? { value: s } : { error: `«${f.label}» no es una fecha válida.` };
    case "select":
      if (!s) return { value: null };
      if (!f.options?.some((o) => o.key === s)) return { error: `«${f.label}» tiene un valor no permitido.` };
      return { value: /^\d+$/.test(s) ? Number(s) : s };
    default: {
      if (!s) return { value: null };
      if (f.name === "rut" || f.name === "causante_rut") return isValidRut(s) ? { value: cleanRut(s) } : { error: `«${f.label}» no tiene un RUT válido.` };
      return { value: s.slice(0, f.type === "textarea" ? 2000 : 300) };
    }
  }
}

/** Crea o edita un bien de la categoría dada. Los campos admitidos son solo los declarados en lvs-bienes.ts. */
export async function saveBien(clientId: string, catKey: string, id: string | null, fd: FormData): Promise<Result & { id?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId) || (id && !isUuid(id))) return { error: "Datos no válidos." };
  const cat = categoria(catKey);
  if (!cat) return { error: "Categoría no válida." };
  const row: Record<string, unknown> = {};
  // Un mismo nombre puede aparecer dos veces con condiciones distintas (p. ej. «anio» en aguas y concesiones): manda el visible
  const clase = String(fd.get("clase") ?? "");
  for (const f of cat.fields) {
    if (f.when && f.when.field === "clase" && clase && f.when.is !== clase) continue;
    const r = parseField(f, fd.get(f.name));
    if ("error" in r) return { error: r.error };
    row[f.name] = r.value;
  }
  // Lo que depende de un Sí/No apagado se limpia
  for (const f of cat.fields) if (f.when && f.when.field !== "clase" && fd.get(f.when.field) !== f.when.is) row[f.name] = null;
  if (cat.key === "muebles" && !row.direccion) {
    const { data: lvs } = await supabase.from("legal_lvs").select("domicilio").eq("client_id", clientId).maybeSingle();
    row.direccion = lvs?.domicilio ?? null;
  }
  let savedId = id;
  if (id) {
    const { error } = await supabase.from(cat.table).update(row).eq("id", id).eq("client_id", clientId);
    if (error) return { error: error.message };
  } else {
    const { count } = await supabase.from(cat.table).select("id", { count: "exact", head: true }).eq("client_id", clientId);
    const { data, error } = await supabase.from(cat.table).insert({ ...row, client_id: clientId, orden: (count ?? 0) + 1 }).select("id").single();
    if (error) return { error: error.message };
    savedId = data.id as string;
  }
  await syncRequisitos(supabase, clientId);
  revalidatePath(`/documentos/lvs/${clientId}`);
  return { id: savedId ?? undefined };
}

export async function deleteBien(clientId: string, catKey: string, id: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId) || !isUuid(id)) return { error: "Datos no válidos." };
  const cat = categoria(catKey);
  if (!cat) return { error: "Categoría no válida." };
  const { error } = await supabase.from(cat.table).delete().eq("id", id).eq("client_id", clientId);
  if (error) return { error: error.message };
  await syncRequisitos(supabase, clientId);
  revalidatePath(`/documentos/lvs/${clientId}`);
  return {};
}

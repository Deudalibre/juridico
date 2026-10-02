"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { isVarName, normalizeVariable, type CatalogVariable } from "@/lib/templates";

type Result = { error?: string };
export type CatalogInput = { name: string; label: string; type: string; source: string | null; hint: string | null };

const cleanHint = (h: string | null | undefined) => {
  const t = String(h ?? "").trim().slice(0, 240);
  return t || null;
};

const refresh = () => {
  revalidatePath("/plantillas/variables");
  revalidatePath("/plantillas");
};

/** Alta de una variable del catálogo. El nombre es el marcador del Word: {nombre}. */
export async function createVariable(input: CatalogInput): Promise<Result> {
  const { supabase, can, user } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar el catálogo." };
  const n = normalizeVariable({ name: input.name, label: input.label, type: input.type as CatalogVariable["type"], source: input.source });
  if (!n.ok) return { error: n.error };
  const { count } = await supabase.from("legal_variables").select("name", { count: "exact", head: true });
  const { error } = await supabase.from("legal_variables").insert({ ...n.v, hint: cleanHint(input.hint), position: count ?? 0, created_by: user.id });
  if (error) return { error: error.code === "23505" ? `Ya existe una variable {${n.v.name}}.` : error.message };
  refresh();
  return {};
}

/** Edita etiqueta, tipo, fuente o pista. El nombre no cambia: es lo que está escrito en los Word. */
export async function updateVariable(name: string, input: Omit<CatalogInput, "name">): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar el catálogo." };
  if (!isVarName(name)) return { error: "Variable no válida." };
  const n = normalizeVariable({ name, label: input.label, type: input.type as CatalogVariable["type"], source: input.source });
  if (!n.ok) return { error: n.error };
  const { error } = await supabase.from("legal_variables").update({ label: n.v.label, type: n.v.type, source: n.v.source, hint: cleanHint(input.hint) }).eq("name", name);
  if (error) return { error: error.message };
  refresh();
  return {};
}

/** Quita la variable del catálogo. Las plantillas que ya la usan conservan su propia copia. */
export async function deleteVariable(name: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.manage")) return { error: "Solo quien administra documentos puede quitar variables del catálogo." };
  if (!isVarName(name)) return { error: "Variable no válida." };
  const { error } = await supabase.from("legal_variables").delete().eq("name", name);
  if (error) return { error: error.message };
  refresh();
  return {};
}

/** Reordena el catálogo (posición = orden en que se ofrecen en el editor). */
export async function reorderVariables(names: string[]): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar el catálogo." };
  if (!names.every(isVarName)) return { error: "Lista no válida." };
  for (const [i, name] of names.entries()) {
    const { error } = await supabase.from("legal_variables").update({ position: i }).eq("name", name);
    if (error) return { error: error.message };
  }
  refresh();
  return {};
}

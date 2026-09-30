"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import type { LegalClient } from "@/lib/data";
import { docText, markVariable as markInDocx, readDocx, replaceVariable, templateError, type DocModel } from "@/lib/docx";
import { PROCEDURES } from "@/lib/legal";
import { DOCX_MIME, FICHA_FIELDS, TEMPLATE_BUCKET, TEMPLATE_MAX_BYTES, clientValues, humanize, isVarName, normalizeVariable, variableNames, type LegalTemplate, type TemplateVariable } from "@/lib/templates";

type Result = { error?: string };
type DocResult = Result & { doc?: DocModel; variables?: TemplateVariable[]; version?: number };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

async function download(supabase: Awaited<ReturnType<typeof getContext>>["supabase"], path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "No se pudo leer el archivo de la plantilla.");
  return Buffer.from(await data.arrayBuffer());
}

/** Variables detectadas en el documento que aún no están en la lista (p. ej. escritas a mano en Word). */
function withDetected(existing: TemplateVariable[], doc: DocModel): TemplateVariable[] {
  const names = variableNames(docText(doc));
  const out = [...existing];
  for (const name of names) {
    if (out.some((v) => v.name === name)) continue;
    const field = FICHA_FIELDS.find((f) => f.key === name);
    out.push({ name, label: field?.label ?? humanize(name), type: field?.type ?? "texto", source: field ? field.key : null });
  }
  return out;
}

/** Registra una plantilla cuyo .docx ya subió el navegador al bucket. Lee el Word y detecta variables escritas a mano. */
export async function registerTemplate(id: string, input: { name: string; procedure: string | null; path: string; fileName: string; size: number }): Promise<Result> {
  const { supabase, can, user } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para crear plantillas." };
  if (!isUuid(id) || input.path !== `${id}/v1.docx`) return { error: "Ruta de archivo no válida." };
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Indica el nombre de la plantilla." };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > TEMPLATE_MAX_BYTES) return { error: "El archivo supera los 25 MB." };
  const procedure = input.procedure && (PROCEDURES as readonly string[]).includes(input.procedure) ? input.procedure : null;
  let doc: DocModel;
  let buf: Buffer;
  try {
    buf = await download(supabase, input.path);
    doc = readDocx(buf);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const compile = templateError(buf);
  if (compile) return { error: `El Word tiene llaves { } sueltas o mal cerradas: ${compile}` };
  const variables = withDetected([], doc);
  const { error } = await supabase
    .from("legal_templates")
    .insert({ id, name, procedure_type: procedure, storage_path: input.path, file_name: input.fileName.slice(0, 200), file_size: input.size, variables, created_by: user.id });
  if (error) return { error: error.message };
  revalidatePath("/plantillas");
  return {};
}

export async function updateTemplate(id: string, input: { name: string; description: string | null; procedure: string | null }): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar plantillas." };
  if (!isUuid(id)) return { error: "Plantilla no válida." };
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Indica el nombre de la plantilla." };
  const procedure = input.procedure && (PROCEDURES as readonly string[]).includes(input.procedure) ? input.procedure : null;
  const { error } = await supabase.from("legal_templates").update({ name, description: input.description?.trim().slice(0, 500) || null, procedure_type: procedure }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/plantillas");
  revalidatePath(`/plantillas/${id}`);
  return {};
}

/** Carga plantilla + archivo, aplica un cambio al Word, valida, guarda y actualiza variables/versión. */
async function withDocx(id: string, change: (buf: Buffer, tpl: LegalTemplate) => { buf: Buffer; variables: TemplateVariable[] } | { error: string }): Promise<DocResult> {
  const { supabase, can } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar plantillas." };
  if (!isUuid(id)) return { error: "Plantilla no válida." };
  const { data: tpl } = await supabase.from("legal_templates").select("*").eq("id", id).maybeSingle();
  if (!tpl) return { error: "Plantilla no encontrada." };
  try {
    const buf = await download(supabase, tpl.storage_path);
    const r = change(buf, tpl as LegalTemplate);
    if ("error" in r) return { error: r.error };
    const compile = templateError(r.buf);
    if (compile) return { error: `El resultado no es una plantilla válida: ${compile}` };
    const doc = readDocx(r.buf);
    const variables = withDetected(r.variables, doc);
    // Cada versión es un archivo nuevo: el CDN del almacén cachea por ruta y una sobrescritura podría leerse vieja.
    // Además queda el historial de versiones en la carpeta de la plantilla.
    const version = tpl.version + 1;
    const path = `${id}/v${version}.docx`;
    const up = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, r.buf, { contentType: DOCX_MIME, cacheControl: "0" });
    if (up.error) return { error: `No se pudo guardar el Word: ${up.error.message}` };
    const { error } = await supabase.from("legal_templates").update({ variables, version, storage_path: path, file_size: r.buf.length }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/plantillas");
    return { doc, variables, version };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Convierte en variable el tramo seleccionado de un párrafo (crea la variable si es nueva). */
export async function markVariable(id: string, input: { p: number; start: number; end: number; name: string; create?: Partial<TemplateVariable> }): Promise<DocResult> {
  const name = input.name.trim();
  if (!isVarName(name)) return { error: "El nombre debe ir en minúsculas, sin espacios ni tildes (p. ej. nombre_completo)." };
  if (![input.p, input.start, input.end].every((n) => Number.isInteger(n) && n >= 0)) return { error: "Selección no válida." };
  return withDocx(id, (buf, tpl) => {
    const variables = [...tpl.variables];
    if (!variables.some((v) => v.name === name)) {
      const n = normalizeVariable({ ...input.create, name });
      if (!n.ok) return { error: n.error };
      variables.push(n.v);
    }
    try {
      return { buf: markInDocx(buf, input.p, input.start, input.end, name), variables };
    } catch (e) {
      return { error: (e as Error).message };
    }
  });
}

/** Crea o edita una variable. Si cambia el nombre, renombra sus marcadores en el Word. */
export async function saveVariable(id: string, oldName: string | null, input: Partial<TemplateVariable>): Promise<DocResult> {
  const n = normalizeVariable(input);
  if (!n.ok) return { error: n.error };
  return withDocx(id, (buf, tpl) => {
    const variables = [...tpl.variables];
    const idx = oldName ? variables.findIndex((v) => v.name === oldName) : -1;
    if (oldName && idx < 0) return { error: "La variable ya no existe." };
    if (variables.some((v, i) => v.name === n.v.name && i !== idx)) return { error: `Ya hay una variable llamada {${n.v.name}}.` };
    if (idx >= 0) variables[idx] = n.v;
    else variables.push(n.v);
    if (oldName && oldName !== n.v.name) return { buf: replaceVariable(buf, oldName, `{${n.v.name}}`).buf, variables };
    return { buf, variables };
  });
}

/** Quita una variable: sus marcadores vuelven a ser texto (la etiqueta) y desaparece de la lista. */
export async function removeVariable(id: string, name: string): Promise<DocResult> {
  if (!isVarName(name)) return { error: "Variable no válida." };
  return withDocx(id, (buf, tpl) => {
    const v = tpl.variables.find((x) => x.name === name);
    if (!v) return { error: "La variable ya no existe." };
    return { buf: replaceVariable(buf, name, v.label).buf, variables: tpl.variables.filter((x) => x.name !== name) };
  });
}

export async function deleteTemplate(id: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.manage")) return { error: "Solo el administrador elimina plantillas." };
  if (!isUuid(id)) return { error: "Plantilla no válida." };
  const { data: tpl } = await supabase.from("legal_templates").select("id").eq("id", id).maybeSingle();
  if (!tpl) return { error: "Plantilla no encontrada." };
  const { error } = await supabase.from("legal_templates").delete().eq("id", id);
  if (error) return { error: error.message };
  // Se borran todas las versiones del Word (carpeta de la plantilla)
  const { data: files } = await supabase.storage.from(TEMPLATE_BUCKET).list(id, { limit: 1000 });
  if (files?.length) await supabase.storage.from(TEMPLATE_BUCKET).remove(files.map((f) => `${id}/${f.name}`));
  revalidatePath("/plantillas");
  return {};
}

/** Enlace temporal (2 minutos) para descargar el Word marcado. */
export async function templateUrl(id: string): Promise<Result & { url?: string }> {
  const { supabase, can } = await getContext();
  if (!can("documents.view")) return { error: "No tienes permiso para ver plantillas." };
  if (!isUuid(id)) return { error: "Plantilla no válida." };
  const { data: tpl } = await supabase.from("legal_templates").select("storage_path, file_name").eq("id", id).maybeSingle();
  if (!tpl) return { error: "Plantilla no encontrada." };
  const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).createSignedUrl(tpl.storage_path, 120, { download: tpl.file_name ?? "plantilla.docx" });
  if (error || !data) return { error: error?.message ?? "No se pudo generar el enlace." };
  return { url: data.signedUrl };
}

/** Valores de la ficha de un cliente para previsualizar la plantilla con datos reales. */
export async function previewValues(clientId: string): Promise<Result & { values?: Record<string, string> }> {
  const { supabase, can } = await getContext();
  if (!can("legal.view")) return { error: "Sin permiso." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  const { data: client } = await supabase.from("legal_clients").select("*").eq("id", clientId).maybeSingle();
  if (!client) return { error: "Cliente no encontrado." };
  let lawyer: string | null = null;
  if (client.lawyer_id) {
    const { data: p } = await supabase.from("profiles").select("full_name").eq("id", client.lawyer_id).maybeSingle();
    lawyer = p?.full_name ?? null;
  }
  return { values: clientValues(client as LegalClient, lawyer) };
}

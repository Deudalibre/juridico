"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { DOC_MAX_BYTES, DOC_MIMES } from "@/lib/legal";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/* ---------------- Documentos y checklist ---------------- */

/** Crea el checklist del cliente a partir de la plantilla de su procedimiento (solo si aún no tiene). */
export async function startChecklist(id: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar la causa." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const { data: client } = await supabase.from("legal_clients").select("procedure_type").eq("id", id).maybeSingle();
  if (!client?.procedure_type) return { error: "Define primero el procedimiento en Antecedentes." };
  const { count } = await supabase.from("legal_checklist_items").select("id", { count: "exact", head: true }).eq("client_id", id);
  if ((count ?? 0) > 0) return {};
  const { data: tpl } = await supabase.from("legal_checklist_templates").select("id").eq("procedure_type", client.procedure_type).eq("active", true).limit(1).maybeSingle();
  if (!tpl) return { error: "No hay checklist definido para este procedimiento." };
  const { data: items } = await supabase.from("legal_checklist_template_items").select("label, position, category_id").eq("template_id", tpl.id).order("position");
  if (!items?.length) return { error: "El checklist de este procedimiento está vacío." };
  const { error } = await supabase.from("legal_checklist_items").insert(items.map((it) => ({ client_id: id, label: it.label, position: it.position, category_id: it.category_id })));
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  return {};
}

/** Registra un archivo ya subido al almacén (el navegador lo sube directo al bucket privado). */
export async function registerDocument(
  id: string,
  input: { path: string; name: string; size: number; mime: string; checklistItemId?: string | null; categoryId?: string | null }
): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.upload")) return { error: "No tienes permiso para subir documentos." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const name = input.name.trim().slice(0, 200);
  if (!name) return { error: "Indica el nombre del documento." };
  if (!(input.mime in DOC_MIMES)) return { error: "Tipo de archivo no admitido (PDF, JPG, PNG, DOC o DOCX)." };
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > DOC_MAX_BYTES) return { error: "El archivo supera los 25 MB." };
  if (!input.path.startsWith(`${id}/`)) return { error: "Ruta de archivo no válida." };
  const itemId = input.checklistItemId && isUuid(input.checklistItemId) ? input.checklistItemId : null;
  const categoryId = input.categoryId && isUuid(input.categoryId) ? input.categoryId : null;

  // Si el ítem ya tenía documento, este lo reemplaza como versión siguiente
  let version = 1;
  let replaces: string | null = null;
  if (itemId) {
    const { data: prev } = await supabase.from("legal_documents").select("id, version").eq("checklist_item_id", itemId).eq("is_current", true).maybeSingle();
    if (prev) {
      version = prev.version + 1;
      replaces = prev.id;
    }
  }
  const { data: doc, error } = await supabase
    .from("legal_documents")
    .insert({ client_id: id, name, status: "recibido", storage_path: input.path, file_size: input.size, mime: input.mime, checklist_item_id: itemId, category_id: categoryId, version, replaces_id: replaces })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (replaces) await supabase.from("legal_documents").update({ is_current: false, status: "reemplazado" }).eq("id", replaces);
  if (itemId) await supabase.from("legal_checklist_items").update({ satisfied: true, not_applicable: false, document_id: doc.id }).eq("id", itemId);
  revalidatePath(`/clientes/${id}`);
  return {};
}

/** Enlace temporal (2 minutos) para ver o descargar un documento del bucket privado. */
export async function documentUrl(docId: string): Promise<Result & { url?: string }> {
  const { supabase, can } = await getContext();
  if (!can("documents.view")) return { error: "No tienes permiso para ver documentos." };
  if (!isUuid(docId)) return { error: "Documento no válido." };
  const { data: doc } = await supabase.from("legal_documents").select("storage_path").eq("id", docId).maybeSingle();
  if (!doc?.storage_path) return { error: "El documento no tiene archivo." };
  const { data, error } = await supabase.storage.from("legal-documents").createSignedUrl(doc.storage_path, 120);
  if (error || !data) return { error: error?.message ?? "No se pudo generar el enlace." };
  return { url: data.signedUrl };
}

/** Estado del documento (recibido, preparado, firmado, presentado). */
export async function setDocumentStatus(docId: string, clientId: string, status: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.edit")) return { error: "No tienes permiso para editar documentos." };
  if (!isUuid(docId) || !isUuid(clientId)) return { error: "Datos no válidos." };
  if (!["recibido", "preparado", "firmado", "presentado"].includes(status)) return { error: "Estado no válido." };
  const { error } = await supabase.from("legal_documents").update({ status }).eq("id", docId).eq("client_id", clientId);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

/** Marca un ítem del checklist como «no aplica» (o lo vuelve a exigir). */
export async function setItemNotApplicable(itemId: string, clientId: string, na: boolean): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar la causa." };
  if (!isUuid(itemId) || !isUuid(clientId)) return { error: "Datos no válidos." };
  const { error } = await supabase.from("legal_checklist_items").update({ not_applicable: na }).eq("id", itemId).eq("client_id", clientId);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

/** Elimina un documento y su archivo (solo documents.manage). */
export async function deleteDocument(docId: string, clientId: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.manage")) return { error: "Solo el administrador elimina documentos." };
  if (!isUuid(docId) || !isUuid(clientId)) return { error: "Datos no válidos." };
  const { data: doc } = await supabase.from("legal_documents").select("storage_path, checklist_item_id").eq("id", docId).eq("client_id", clientId).maybeSingle();
  if (!doc) return { error: "Documento no encontrado." };
  if (doc.storage_path) await supabase.storage.from("legal-documents").remove([doc.storage_path]);
  const { error } = await supabase.from("legal_documents").delete().eq("id", docId);
  if (error) return { error: error.message };
  if (doc.checklist_item_id) await supabase.from("legal_checklist_items").update({ satisfied: false, document_id: null }).eq("id", doc.checklist_item_id);
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

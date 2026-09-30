"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { driveAccess, driveIdFromUrl, getFolder } from "@/lib/google";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** Vincula la carpeta del cliente (enlace pegado o candidata elegida). Valida que exista y sea carpeta. */
export async function linkClientFolder(clientId: string, input: string): Promise<Result & { name?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  const id = driveIdFromUrl(input);
  if (!id) return { error: "Pega el enlace de una carpeta de Google Drive." };
  const access = await driveAccess(supabase).catch((e: Error) => {
    throw e;
  });
  if (!access) return { error: "Google Drive no está conectado. Pídele al administrador que lo conecte en Configuración." };
  const folder = await getFolder(access, id);
  if (!folder) return { error: "No se encontró esa carpeta o la cuenta conectada no tiene acceso a ella." };
  const { error } = await supabase.from("legal_clients").update({ drive_folder_url: folder.webViewLink }).eq("id", clientId);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clientId}`);
  return { name: folder.name };
}

/** Un archivo del Drive queda como documento del cliente; si se indica un antecedente, lo marca recibido. */
export async function linkDriveFile(
  clientId: string,
  input: { fileId: string; name: string; mime: string; link: string; checklistItemId?: string | null }
): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("documents.upload")) return { error: "No tienes permiso para registrar documentos." };
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  if (!/^[A-Za-z0-9_-]{10,}$/.test(input.fileId)) return { error: "Archivo no válido." };
  const itemId = input.checklistItemId && isUuid(input.checklistItemId) ? input.checklistItemId : null;
  const name = input.name.trim().slice(0, 200) || "Documento";
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
    .insert({ client_id: clientId, name, status: "recibido", mime: input.mime, drive_file_id: input.fileId, drive_link: input.link, checklist_item_id: itemId, version, replaces_id: replaces })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (replaces) await supabase.from("legal_documents").update({ is_current: false, status: "reemplazado" }).eq("id", replaces);
  if (itemId) await supabase.from("legal_checklist_items").update({ satisfied: true, not_applicable: false, document_id: doc.id }).eq("id", itemId);
  revalidatePath(`/clientes/${clientId}`);
  return {};
}

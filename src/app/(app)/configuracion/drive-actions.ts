"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { driveAccess, driveIdFromUrl, getFolder } from "@/lib/google";

type Result = { error?: string };

/** Carpeta raíz donde están las carpetas por cliente (enlace o id). */
export async function setDriveRoot(fd: FormData): Promise<Result & { name?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.settings")) return { error: "Solo el administrador configura el Drive." };
  const id = driveIdFromUrl(String(fd.get("root") ?? ""));
  if (!id) return { error: "Pega el enlace de la carpeta raíz de clientes." };
  const access = await driveAccess(supabase);
  if (!access) return { error: "Conecta primero Google Drive." };
  const folder = await getFolder(access, id);
  if (!folder) return { error: "No se encontró esa carpeta o la cuenta conectada no tiene acceso." };
  const { error } = await supabase.rpc("drive_set_root", { p_folder_id: folder.id, p_name: folder.name });
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return { name: folder.name };
}

export async function disconnectDrive(): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.settings")) return { error: "Solo el administrador configura el Drive." };
  const { error } = await supabase.rpc("drive_disconnect");
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  return {};
}

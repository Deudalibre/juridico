"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { createFolder, driveAccess, driveIdFromUrl, driveWriteError, getFolder } from "@/lib/google";

type Result = { error?: string };

// Nombre de la carpeta universal cuando la crea la app en «Mi unidad» de la cuenta conectada (un archivo "use server"
// solo puede exportar funciones, por eso no se exporta)
const NOMBRE_CARPETA_UNIVERSAL = "JURÍDICO - CLIENTES";

/** Carpeta universal (enlace o id): dentro de ella la app crea una carpeta por cliente con sus documentos. */
export async function setDriveRoot(fd: FormData): Promise<Result & { name?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.settings")) return { error: "Solo el administrador configura el Drive." };
  const id = driveIdFromUrl(String(fd.get("root") ?? ""));
  if (!id) return { error: "Pega el enlace de la carpeta universal." };
  const access = await driveAccess(supabase);
  if (!access) return { error: "Conecta primero Google Drive." };
  const folder = await getFolder(access, id);
  if (!folder) return { error: "No se encontró esa carpeta o la cuenta conectada no tiene acceso." };
  const { error } = await supabase.rpc("drive_set_root", { p_folder_id: folder.id, p_name: folder.name });
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/documentos");
  return { name: folder.name };
}

/**
 * Crea la carpeta universal en «Mi unidad» de la cuenta conectada y la deja como raíz. Es el camino seguro: la app
 * solo puede escribir en carpetas que ella misma creó (permiso «drive.file»), así que esta carpeta siempre admite
 * las carpetas por cliente y los documentos generados.
 */
export async function createDriveRoot(): Promise<Result & { name?: string; link?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.settings")) return { error: "Solo el administrador configura el Drive." };
  const access = await driveAccess(supabase);
  if (!access) return { error: "Conecta primero Google Drive." };
  try {
    const folder = await createFolder(access, NOMBRE_CARPETA_UNIVERSAL, null);
    const { error } = await supabase.rpc("drive_set_root", { p_folder_id: folder.id, p_name: folder.name });
    if (error) return { error: error.message };
    revalidatePath("/configuracion");
    revalidatePath("/documentos");
    return { name: folder.name, link: folder.webViewLink };
  } catch (e) {
    return { error: driveWriteError(e) };
  }
}

export async function disconnectDrive(): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.settings")) return { error: "Solo el administrador configura el Drive." };
  const { error } = await supabase.rpc("drive_disconnect");
  if (error) return { error: error.message };
  revalidatePath("/configuracion");
  revalidatePath("/documentos");
  return {};
}

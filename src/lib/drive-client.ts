// Carpeta del cliente en el Drive: resolución y listado (servidor). Sin secretos aquí: los tokens
// los entrega la base con drive_tokens() y la API los usa en src/lib/google.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveAccess, driveIdFromUrl, driveState, findClientFolders, getFolder, listFolder, type DriveFile, type DriveFolder } from "./google";
import { formatRut } from "./rut";

export type ClientDrive = {
  connected: boolean;
  configured: boolean; // hay carpeta raíz
  folder: DriveFolder | null;
  candidates: DriveFolder[]; // cuando no hay carpeta vinculada y hay varias parecidas
  files: DriveFile[];
  error: string | null;
};

const EMPTY: ClientDrive = { connected: false, configured: false, folder: null, candidates: [], files: [], error: null };

/**
 * Carpeta y archivos del cliente. Si aún no tiene carpeta vinculada, la busca por RUT o nombre en la
 * carpeta raíz; si hay una sola coincidencia la vincula sola (drive_folder_url).
 */
export async function clientDrive(supabase: SupabaseClient, client: { id: string; full_name: string; rut: string | null; drive_folder_url: string | null }): Promise<ClientDrive> {
  const state = await driveState(supabase);
  if (!state.connected) return EMPTY;
  const base = { ...EMPTY, connected: true, configured: Boolean(state.rootId) };
  try {
    const access = await driveAccess(supabase);
    if (!access) return base;
    let folder: DriveFolder | null = null;
    const linkedId = driveIdFromUrl(client.drive_folder_url);
    if (linkedId) folder = await getFolder(access, linkedId);
    let candidates: DriveFolder[] = [];
    if (!folder && state.rootId) {
      const terms = [client.rut ? formatRut(client.rut) : "", client.rut ?? "", client.full_name].filter(Boolean);
      candidates = await findClientFolders(access, state.rootId, terms);
      if (candidates.length === 1) {
        folder = candidates[0];
        candidates = [];
        await supabase.from("legal_clients").update({ drive_folder_url: folder.webViewLink }).eq("id", client.id);
      }
    }
    const files = folder ? await listFolder(access, folder.id) : [];
    return { ...base, folder, candidates, files };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

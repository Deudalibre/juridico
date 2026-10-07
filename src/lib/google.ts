// Solo se usa desde el servidor (route handlers, server actions y páginas): contiene el client secret.
// Integración con el Google Drive del estudio: una conexión para todos, carpetas por cliente.
// Permisos pedidos: leer el Drive (listar y previsualizar) y crear archivos y carpetas desde la app (la carpeta
// universal, una carpeta por cliente y los documentos generados dentro). Con «drive.file» la app solo escribe en lo
// que ella misma creó: por eso la carpeta universal la crea la app desde Configuración. Nunca se borra nada en el
// Drive desde aquí.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Llave que solo conoce el servidor: la base la exige en drive_tokens()/drive_save_access() cuando existe en la
// bóveda (migración 0017). Sin ella configurada, la base sigue aceptando las llamadas (ver auditoría 2026-09-30).
const SERVER_KEY = process.env.DRIVE_SERVER_KEY ?? null;

const GOOGLE_SCOPE = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/userinfo.email"].join(" ");

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function authUrl(redirectUri: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Google rechazó la autorización");
  return json;
}

export const exchangeCode = (code: string, redirectUri: string) => tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
const refreshAccess = (refreshToken: string) => tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });

async function gapi(access: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${access}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(json.error?.message || `Google respondió ${res.status}`), { status: res.status });
  return json;
}

export const userEmail = async (access: string): Promise<string> => (await gapi(access, "https://www.googleapis.com/oauth2/v2/userinfo")).email as string;

export type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; size: number | null; webViewLink: string; iconLink: string | null; isFolder: boolean };
export type DriveFolder = { id: string; name: string; webViewLink: string };

const FILE_FIELDS = "files(id,name,mimeType,modifiedTime,size,webViewLink,iconLink),nextPageToken";
const FOLDER = "application/vnd.google-apps.folder";
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Archivos y subcarpetas de una carpeta (hasta 200), carpetas primero y luego por fecha. */
export async function listFolder(access: string, folderId: string): Promise<DriveFile[]> {
  const q = `'${esc(folderId)}' in parents and trashed = false`;
  const out: DriveFile[] = [];
  let token: string | undefined;
  do {
    const p = new URLSearchParams({ q, fields: FILE_FIELDS, pageSize: "100", orderBy: "folder,modifiedTime desc", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
    if (token) p.set("pageToken", token);
    const json = await gapi(access, `https://www.googleapis.com/drive/v3/files?${p}`);
    for (const f of json.files ?? []) out.push({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: f.size ? Number(f.size) : null, webViewLink: f.webViewLink, iconLink: f.iconLink ?? null, isFolder: f.mimeType === FOLDER });
    token = json.nextPageToken;
  } while (token && out.length < 200);
  return out;
}

/** Datos de una carpeta (para validar el enlace pegado). */
export async function getFolder(access: string, id: string): Promise<DriveFolder | null> {
  try {
    const f = await gapi(access, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink&supportsAllDrives=true`);
    return f.mimeType === FOLDER ? { id: f.id, name: f.name, webViewLink: f.webViewLink } : null;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

/**
 * Busca la carpeta del cliente por RUT o nombre: primero justo dentro de la carpeta raíz y, si no hay,
 * en todo el Drive al que accede la cuenta (las carpetas del estudio van por año y mes). Devuelve las candidatas.
 */
export async function findClientFolders(access: string, rootId: string | null, terms: string[]): Promise<DriveFolder[]> {
  const clean = terms.map((t) => t.trim()).filter((t) => t.length >= 3);
  if (clean.length === 0) return [];
  const names = clean.map((t) => `name contains '${esc(t)}'`).join(" or ");
  const run = async (scope: string) => {
    const q = `${scope}mimeType = '${FOLDER}' and trashed = false and (${names})`;
    const p = new URLSearchParams({ q, fields: "files(id,name,webViewLink)", pageSize: "10", supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "allDrives" });
    const json = await gapi(access, `https://www.googleapis.com/drive/v3/files?${p}`);
    return (json.files ?? []).map((f: DriveFolder) => ({ id: f.id, name: f.name, webViewLink: f.webViewLink })) as DriveFolder[];
  };
  if (rootId) {
    const direct = await run(`'${esc(rootId)}' in parents and `);
    if (direct.length > 0) return direct;
  }
  return run("");
}

/** Id de carpeta o archivo a partir de un enlace de Drive (o del id pegado tal cual). */
export function driveIdFromUrl(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/\/d\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/** Vista previa incrustable de un archivo (el Drive la sirve para quien tiene acceso). */
export const drivePreviewUrl = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;

/** Subcarpeta con ese nombre exacto dentro de una carpeta (la más antigua si hubiera repetidas). */
export async function findChildFolder(access: string, parentId: string, name: string): Promise<DriveFolder | null> {
  const q = `'${esc(parentId)}' in parents and mimeType = '${FOLDER}' and name = '${esc(name)}' and trashed = false`;
  const p = new URLSearchParams({ q, fields: "files(id,name,webViewLink)", pageSize: "5", supportsAllDrives: "true", includeItemsFromAllDrives: "true", orderBy: "createdTime" });
  const json = await gapi(access, `https://www.googleapis.com/drive/v3/files?${p}`);
  const f = (json.files ?? [])[0];
  return f ? { id: f.id, name: f.name, webViewLink: f.webViewLink } : null;
}

/** Crea una carpeta (en «Mi unidad» si no se indica carpeta madre). */
export async function createFolder(access: string, name: string, parentId: string | null): Promise<DriveFolder> {
  const body: Record<string, unknown> = { name, mimeType: FOLDER };
  if (parentId) body.parents = [parentId];
  const f = await gapi(access, "https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink&supportsAllDrives=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: f.id, name: f.name, webViewLink: f.webViewLink };
}

/** La subcarpeta con ese nombre, creándola si no existe. */
export async function ensureFolder(access: string, parentId: string, name: string): Promise<DriveFolder> {
  return (await findChildFolder(access, parentId, name)) ?? createFolder(access, name, parentId);
}

export type DriveUpload = { id: string; name: string; webViewLink: string };

/**
 * Guarda un archivo en una carpeta. Con el id de un archivo ya existente reemplaza su contenido (mismo enlace; el
 * Drive conserva las versiones anteriores en su historial). Si ese archivo ya no existe, crea uno nuevo.
 */
export async function uploadFile(access: string, parentId: string, name: string, content: Uint8Array, mime: string, existingId: string | null): Promise<DriveUpload> {
  const fields = "id,name,webViewLink";
  if (existingId) {
    try {
      const f = await gapi(access, `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=media&fields=${fields}&supportsAllDrives=true`, {
        method: "PATCH",
        headers: { "Content-Type": mime },
        body: content as BodyInit,
      });
      // El nombre puede haber cambiado (se corrigió el nombre del cliente): se alinea sin crear otro archivo
      if (f.name !== name)
        await gapi(access, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(existingId)}?fields=${fields}&supportsAllDrives=true`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      return { id: f.id, name, webViewLink: f.webViewLink };
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
    }
  }
  const boundary = `dl${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, parents: [parentId] });
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([head, Buffer.from(content), tail]);
  const f = await gapi(access, `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}&supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: body as BodyInit,
  });
  return { id: f.id, name: f.name, webViewLink: f.webViewLink };
}

/** Mensaje para el operador cuando Google rechaza una escritura (carpeta que la app no creó o permiso insuficiente). */
export function driveWriteError(e: unknown): string {
  const st = (e as { status?: number }).status;
  const msg = (e as Error).message ?? String(e);
  if (st === 403 || st === 404 || /insufficient/i.test(msg)) return `${msg}. La app solo puede escribir en la carpeta universal que ella misma creó desde Configuración.`;
  return msg;
}

export type DriveState = { connected: boolean; email: string | null; rootId: string | null; rootName: string | null; error: string | null };

/** Estado de la conexión (sin secretos). */
export async function driveState(supabase: SupabaseClient): Promise<DriveState> {
  const { data } = await supabase.rpc("drive_status");
  const row = (data as { connected: boolean; google_email: string | null; root_folder_id: string | null; root_folder_name: string | null; last_error: string | null }[] | null)?.[0];
  return { connected: Boolean(row?.connected), email: row?.google_email ?? null, rootId: row?.root_folder_id ?? null, rootName: row?.root_folder_name ?? null, error: row?.last_error ?? null };
}

/** Access token vigente (refresca con el refresh token cuando caduca). null si no hay conexión. */
export async function driveAccess(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("drive_tokens", { p_key: SERVER_KEY });
  if (error) throw new Error(error.message);
  const row = (data as { access_token: string | null; expires_at: string | null; refresh_token: string }[] | null)?.[0];
  if (!row) return null;
  if (row.access_token && row.expires_at && Date.parse(row.expires_at) > Date.now() + 30_000) return row.access_token;
  try {
    const t = await refreshAccess(row.refresh_token);
    await supabase.rpc("drive_save_access", { p_access: t.access_token, p_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), p_error: null, p_key: SERVER_KEY });
    return t.access_token;
  } catch (e) {
    await supabase.rpc("drive_save_access", { p_access: null, p_expires_at: null, p_error: (e as Error).message, p_key: SERVER_KEY });
    throw e;
  }
}

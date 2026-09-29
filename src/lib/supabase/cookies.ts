import type { CookieOptionsWithName } from "@supabase/ssr";

/** Dominio padre en producción: app.deudalibre.cl y juridico.deudalibre.cl comparten la misma sesión. */
const DOMINIO_COMPARTIDO = ".deudalibre.cl";

/**
 * Opciones de la cookie de sesión según el host de la petición.
 * En localhost y en las vistas previas de Vercel no se fija dominio (cookie solo del host).
 */
export function sessionCookieOptions(host: string | null | undefined): CookieOptionsWithName | undefined {
  const h = (host ?? "").split(":")[0].toLowerCase();
  const compartido = h === DOMINIO_COMPARTIDO.slice(1) || h.endsWith(DOMINIO_COMPARTIDO);
  return compartido ? { domain: DOMINIO_COMPARTIDO } : undefined;
}

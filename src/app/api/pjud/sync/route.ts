import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CausaNoEncontrada, PjudBloqueado, PjudClient, normalizarTribunal } from "@/lib/pjud";
import { pjudCooldown } from "@/lib/pjud-data";
import { createClient as createServerClient, readSessionUser } from "@/lib/supabase/server";

/**
 * Sincronización con el Poder Judicial. La llama el cron de Vercel (ver vercel.json) con
 * `Authorization: Bearer ${CRON_SECRET}`, varias veces seguidas a partir de las 12:00 de Chile: cada pasada toma las
 * causas con rol y tribunal más antiguas por `synced_at` (hasta `limite`, 40 por defecto) y, respetando los 5 segundos
 * entre consultas de la OJV, guarda cada lectura o su error con pjud_guardar (clave service_role).
 *
 * Modo prueba, sin tocar la base: `?rol=C-12971-2026&tribunal=13º Juzgado Civil de Santiago` devuelve el detalle. Sirve
 * para comprobar desde Vercel que la IP del despliegue no está bloqueada.
 */
export const maxDuration = 300;

const CONTACTO = process.env.PJUD_CONTACTO ?? "juridico@deudalibre.cl";
const SEGUNDOS_RESERVA = 25; // se deja de tomar causas cuando queda menos que esto del presupuesto de la función

function autorizado(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secreto}`;
}

/** Una causa a petición: 429 si se sincronizó hace menos de 6 horas (salvo el cron), 200 con el resumen si se leyó. */
async function sincronizarUna(causaId: string, esCron: boolean) {
  if (!/^[0-9a-f-]{36}$/i.test(causaId)) return NextResponse.json({ error: "causa_id no válido" }, { status: 400 });
  let supabase: ReturnType<typeof servicio> | Awaited<ReturnType<typeof createServerClient>> | null;
  if (esCron) supabase = servicio();
  else {
    // Sesión del operador (loadSession lleva «use cache: private» y no sirve en una ruta): usuario activo con legal.edit
    const propio = await createServerClient();
    const user = await readSessionUser(propio);
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const [{ data: perfil }, { data: permisos }] = await Promise.all([propio.from("profiles").select("active").eq("id", user.id).maybeSingle(), propio.rpc("my_permissions")]);
    if (!perfil?.active || !((permisos ?? []) as string[]).includes("legal.edit")) return NextResponse.json({ error: "Sin permiso para sincronizar" }, { status: 403 });
    supabase = propio;
  }
  if (!supabase) return NextResponse.json({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const { data: c } = await supabase.from("legal_clients").select("id, rol, tribunal, pjud_causa_data(synced_at)").eq("id", causaId).maybeSingle();
  if (!c) return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
  if (!c.rol || !c.tribunal) return NextResponse.json({ error: "La causa no tiene rol y tribunal" }, { status: 422 });
  const previa = (Array.isArray(c.pjud_causa_data) ? c.pjud_causa_data[0] : c.pjud_causa_data) as { synced_at: string | null } | null;
  if (!esCron) {
    const espera = pjudCooldown(previa?.synced_at);
    if (espera) return NextResponse.json({ error: "cooldown", synced_at: previa!.synced_at, next_available: espera.next_available }, { status: 429 });
  }
  const cliente = new PjudClient(CONTACTO);
  const inicio = Date.now();
  try {
    const { data: t } = await supabase.from("pjud_tribunales").select("codigo").eq("nombre_norm", normalizarTribunal(c.tribunal)).maybeSingle();
    const codigo = (t?.codigo as number | undefined) ?? 0;
    const d = await cliente.detalleCausa(String(c.rol).trim().toUpperCase(), c.tribunal, codigo);
    const { error } = await supabase.rpc("pjud_guardar", { p_client: c.id, p_data: { ...d, tribunal_codigo: codigo || null } });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, rol: d.rol, actuaciones: d.cuadernos.reduce((a, q) => a + q.actuaciones.length, 0), synced_at: new Date().toISOString(), segundos: (Date.now() - inicio) / 1000 });
  } catch (e) {
    const msg = (e as Error).message;
    await supabase.rpc("pjud_guardar", { p_client: c.id, p_data: null, p_error: msg });
    return NextResponse.json({ ok: false, error: msg, tipo: (e as Error).constructor.name }, { status: e instanceof PjudBloqueado ? 503 : e instanceof CausaNoEncontrada ? 404 : 502 });
  }
}

function servicio() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const esCron = autorizado(req);
  const causaId = new URL(req.url).searchParams.get("causa_id");
  // Sincronización MANUAL de una causa (?causa_id=): con la sesión del usuario (legal.edit) y cooldown de 6 horas;
  // el cron, identificado por el Bearer, puede sincronizar una causa concreta sin cooldown.
  if (causaId) return sincronizarUna(causaId, esCron);
  if (!esCron) {
    // Diagnóstico sin revelar el secreto: si falta la variable en el despliegue o si el valor enviado no calza
    const s = process.env.CRON_SECRET;
    return NextResponse.json({ error: "No autorizado", secretoConfigurado: Boolean(s), largoConfigurado: s?.length ?? 0, servicioConfigurado: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), region: process.env.VERCEL_REGION ?? null, entorno: process.env.VERCEL_ENV ?? null }, { status: 401 });
  }
  const url = new URL(req.url);
  const inicio = Date.now();
  const cliente = new PjudClient(CONTACTO);

  // Modo prueba: una causa, sin guardar
  const rolPrueba = url.searchParams.get("rol");
  if (rolPrueba) {
    try {
      const d = await cliente.detalleCausa(rolPrueba, url.searchParams.get("tribunal") ?? "", Number(url.searchParams.get("codigo") ?? 0));
      return NextResponse.json({ ok: true, region: process.env.VERCEL_REGION ?? null, segundos: (Date.now() - inicio) / 1000, bitacora: cliente.bitacora, detalle: { ...d, cuadernos: d.cuadernos.map((c) => ({ nombre: c.nombre, actuaciones: c.actuaciones.length, ultima: c.actuaciones[0] ?? null })) } });
    } catch (e) {
      return NextResponse.json({ ok: false, region: process.env.VERCEL_REGION ?? null, tipo: (e as Error).constructor.name, error: (e as Error).message, bitacora: cliente.bitacora }, { status: e instanceof PjudBloqueado ? 503 : 200 });
    }
  }

  const supabase = servicio();
  if (!supabase) return NextResponse.json({ error: "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  const limite = Math.min(100, Math.max(1, Number(url.searchParams.get("limite") ?? 40)));

  // La cola priorizada la arma la base (pjud_cola_sync): primero actuaciones recientes, luego las más antiguas; sin las no encontradas
  const { data: cola, error } = await supabase.rpc("pjud_cola_sync", { p_limite: limite, p_desde: url.searchParams.get("desde") });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const pendientes = ((cola ?? []) as { client_id: string; rol: string; tribunal: string }[]).map((f) => ({ id: f.client_id, rol: f.rol, tribunal: f.tribunal }));

  const { data: tribunales } = await supabase.from("pjud_tribunales").select("codigo, nombre_norm");
  const codigoDe = new Map((tribunales ?? []).map((t) => [t.nombre_norm as string, t.codigo as number]));

  const resultado = { synced: 0, failed: 0, skipped: 0, errors: [] as { rol: string; error: string }[], bloqueo: null as string | null, segundos: 0 };
  for (const c of pendientes) {
    if ((Date.now() - inicio) / 1000 > maxDuration - SEGUNDOS_RESERVA) {
      resultado.skipped = pendientes.length - resultado.synced - resultado.failed;
      break;
    }
    try {
      const codigo = codigoDe.get(normalizarTribunal(c.tribunal)) ?? 0;
      const d = await cliente.detalleCausa(c.rol.trim().toUpperCase(), c.tribunal, codigo);
      const { error: e } = await supabase.rpc("pjud_guardar", { p_client: c.id, p_data: { ...d, tribunal_codigo: codigo || null } });
      if (e) throw new Error(`No se pudo guardar: ${e.message}`);
      resultado.synced++;
    } catch (e) {
      const msg = (e as Error).message;
      resultado.failed++;
      resultado.errors.push({ rol: c.rol, error: msg.slice(0, 300) });
      await supabase.rpc("pjud_guardar", { p_client: c.id, p_data: null, p_error: msg });
      if (e instanceof PjudBloqueado) {
        resultado.bloqueo = msg;
        break; // detención total: no se sigue consultando
      }
      if (!(e instanceof CausaNoEncontrada)) continue;
    }
  }
  resultado.segundos = Math.round((Date.now() - inicio) / 1000);
  return NextResponse.json({ ...resultado, pendientes: pendientes.length, peticiones: cliente.bitacora.length, region: process.env.VERCEL_REGION ?? null });
}

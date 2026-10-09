import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { CausaNoEncontrada, PjudBloqueado, PjudClient, normalizarTribunal } from "@/lib/pjud";

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
  if (!autorizado(req)) {
    // Diagnóstico sin revelar el secreto: si falta la variable en el despliegue o si el valor enviado no calza
    const s = process.env.CRON_SECRET;
    return NextResponse.json({ error: "No autorizado", secretoConfigurado: Boolean(s), largoConfigurado: s?.length ?? 0 }, { status: 401 });
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

  // Causas con rol y tribunal, las que llevan más tiempo sin sincronizar primero (las nunca leídas van al inicio)
  const { data: causas, error } = await supabase
    .from("legal_clients")
    .select("id, rol, tribunal, pjud_causa_data(synced_at, error_at)")
    .is("archived_at", null)
    .not("rol", "is", null)
    .not("tribunal", "is", null)
    .limit(2000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  type Fila = { id: string; rol: string; tribunal: string; pjud_causa_data: { synced_at: string | null; error_at: string | null } | { synced_at: string | null; error_at: string | null }[] | null };
  const marca = (f: Fila) => {
    const d = Array.isArray(f.pjud_causa_data) ? f.pjud_causa_data[0] : f.pjud_causa_data;
    return Math.max(Date.parse(d?.synced_at ?? "") || 0, Date.parse(d?.error_at ?? "") || 0);
  };
  const pendientes = ((causas ?? []) as Fila[]).filter((f) => /^[A-Z]-\d+-\d{4}$/i.test(f.rol.trim())).sort((a, b) => marca(a) - marca(b)).slice(0, limite);

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

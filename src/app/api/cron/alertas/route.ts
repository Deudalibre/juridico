import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

/**
 * Resumen diario de Jurídico (cron de Vercel, 08:00 de Chile de lunes a viernes): causas sin revisión hace más de
 * 30 días, causas con movimiento nuevo en el PJUD (última actuación de ayer o de hoy), tareas vencidas y causas en
 * semáforo crítico (apercibimiento o demanda rechazada). Protegido con CRON_SECRET; lee con la clave de servicio.
 * Si todo está en cero no manda nada. GET con Authorization: Bearer CRON_SECRET → { sent, indicators, reason? }.
 */
export const maxDuration = 60;

const APP = (process.env.NEXT_PUBLIC_APP_URL ?? "https://juridico.deudalibre.cl").replace(/\/$/, "");

function autorizado(req: Request) {
  const s = process.env.CRON_SECRET;
  return !!s && (req.headers.get("authorization") ?? "") === `Bearer ${s}`;
}

function hoyChile() {
  const ahora = new Date();
  const ymd = ahora.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const larga = ahora.toLocaleDateString("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const ayer = new Date(`${ymd}T12:00:00Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  return { ymd, larga, ayer: ayer.toISOString().slice(0, 10) };
}

type Indicadores = { sin_revision_30: number; movimiento_pjud: number; movimiento_roles: string[]; tareas_vencidas: number; semaforo_critico: number };

async function recolectar(): Promise<Indicadores> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { ymd, ayer } = hoyChile();
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [sinRevision, pjud, tareas, semaforo] = await Promise.all([
    s.from("legal_clients").select("id", { count: "exact", head: true }).is("archived_at", null).or(`last_review_at.is.null,last_review_at.lt.${hace30}`),
    // Movimiento real en el PJUD: la última actuación publicada es de ayer o de hoy (no basta con que se haya sincronizado)
    s.from("pjud_causa_data").select("rol, legal_clients!inner(archived_at)").gte("ultima_actuacion", ayer).lte("ultima_actuacion", ymd).is("legal_clients.archived_at", null).limit(500),
    s.from("legal_tasks").select("id", { count: "exact", head: true }).eq("status", "pendiente").lt("due_at", `${ymd}T00:00:00`),
    s.from("legal_clients").select("id", { count: "exact", head: true }).is("archived_at", null).in("semaforo", ["apercibimiento", "rechazada"]),
  ]);
  for (const r of [sinRevision, pjud, tareas, semaforo]) if (r.error) throw new Error(r.error.message);
  const roles = ((pjud.data ?? []) as { rol: string }[]).map((r) => r.rol);
  return { sin_revision_30: sinRevision.count ?? 0, movimiento_pjud: roles.length, movimiento_roles: roles, tareas_vencidas: tareas.count ?? 0, semaforo_critico: semaforo.count ?? 0 };
}

const fila = (icono: string, n: number, texto: string, extra = "") =>
  `<tr><td style="padding:6px 10px 6px 0;font-size:18px;line-height:1">${icono}</td><td style="padding:6px 0;font-size:15px;color:#1f2937"><strong style="font-size:17px">${n}</strong> ${texto}${extra ? `<div style="font-size:12px;color:#6b7280">${extra}</div>` : ""}</td></tr>`;

function htmlResumen(ind: Indicadores, fechaLarga: string) {
  const roles = ind.movimiento_roles.slice(0, 20).join(" · ") + (ind.movimiento_roles.length > 20 ? ` · y ${ind.movimiento_roles.length - 20} más` : "");
  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:22px 24px">
  <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">Deuda Libre · Jurídico</div>
  <div style="font-size:18px;font-weight:600;color:#111827;margin:4px 0 14px">Resumen del ${fechaLarga}</div>
  <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 10px">
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${fila("📋", ind.sin_revision_30, "causas sin revisión +30 días")}
    ${fila("⚖️", ind.movimiento_pjud, "causas con movimiento en PJUD", roles)}
    ${fila("⏰", ind.tareas_vencidas, "tareas vencidas")}
    ${fila("🔴", ind.semaforo_critico, "causas en semáforo crítico")}
  </table>
  <div style="margin-top:18px">
    <a href="${APP}/clientes" style="display:inline-block;padding:8px 14px;border-radius:6px;background:#0f6c73;color:#fff;text-decoration:none;font-size:13px">Ver causas →</a>
  </div>
</div></body></html>`;
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let indicators: Indicadores;
  try {
    indicators = await recolectar();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  const { ymd, larga } = hoyChile();
  const hayAlgo = indicators.sin_revision_30 + indicators.movimiento_pjud + indicators.tareas_vencidas + indicators.semaforo_critico > 0;
  if (!hayAlgo) return NextResponse.json({ sent: false, reason: "todo en cero", indicators });
  const to = (process.env.ALERT_EMAIL_TO ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const from = process.env.ALERT_EMAIL_FROM;
  const key = process.env.RESEND_API_KEY;
  if (!key || !from || to.length === 0) return NextResponse.json({ sent: false, reason: "faltan RESEND_API_KEY, ALERT_EMAIL_FROM o ALERT_EMAIL_TO", indicators });
  const fecha = ymd.split("-").reverse().join("/");
  try {
    const r = await new Resend(key).emails.send({ from, to, subject: `Deuda Libre Jurídico · Resumen ${fecha}`, html: htmlResumen(indicators, larga) });
    if (r.error) return NextResponse.json({ sent: false, reason: r.error.message, indicators }, { status: 502 });
    return NextResponse.json({ sent: true, id: r.data?.id ?? null, to, indicators });
  } catch (e) {
    return NextResponse.json({ sent: false, reason: (e as Error).message, indicators }, { status: 502 });
  }
}

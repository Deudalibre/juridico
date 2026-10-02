// Latido para mantener caliente la función de Vercel (el cron de vercel.json la llama cada 5 minutos).
// Sin sesión, sin base de datos: solo confirma que el servidor responde. Así el primer clic de la mañana
// no paga el arranque en frío (≈1 s) y la pantalla llega en la fracción de segundo habitual.
import { connection } from "next/server";

export async function GET() {
  await connection();
  return Response.json({ ok: true, at: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}

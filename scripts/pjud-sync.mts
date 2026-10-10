// Sincroniza con el Poder Judicial TODAS las causas con rol y tribunal, desde una IP chilena/LATAM (PC del estudio o
// el Cloud Run Job en southamerica-west1: el cortafuegos del PJUD rechaza las IP de datacenter de EE.UU./UE como Vercel o Railway).
//   npx -y tsx scripts/pjud-sync.mts --cuenta C:/ruta/credenciales.txt [--limite 40] [--solo C-12971-2026] [--mes 2026-08] [--desde 2026-08-01] [--listar] [--contacto correo] [--origen cloud-run]
// Guarda cada lectura (o su error) con pjud_guardar como el usuario de la cuenta (necesita legal.edit). Respeta los 5
// segundos entre consultas: unas 231 causas tardan ~20 minutos. PC del estudio: Programador de tareas a las 12:00.
// Google Cloud: Cloud Run Job pjud-sync, disparado por Cloud Scheduler a las 12:00 (ver DEPLOY-PJUD-GCP.md).
import { createClient } from "@supabase/supabase-js";
import { CausaNoEncontrada, PjudBloqueado, PjudClient, normalizarTribunal } from "../src/lib/pjud";
import { cargarCuenta, cargarEnv } from "./pjud-entorno.mts";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const env = cargarEnv();
const { email, password } = cargarCuenta(opt);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await supabase.auth.signInWithPassword({ email, password });
if (login.error) {
  console.error("No se pudo iniciar sesión:", login.error.message);
  process.exit(1);
}
const limite = Number(opt("--limite") ?? 1000);
const solo = opt("--solo")?.toUpperCase();
// --mes AAAA-MM: solo las causas ingresadas ese mes (intake_date, la fecha de ingreso de la demanda)
const mes = opt("--mes");
/** «2026-08» → «2026-09-01» (límite superior del mes, excluido) */
const mesSiguiente = (m: string) => { const [y, mm] = m.split("-").map(Number); return mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, "0")}-01`; };
if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
  console.error("--mes debe ser AAAA-MM, por ejemplo 2026-08");
  process.exit(1);
}
const inicio = Date.now();
const hora = () => new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" });

// Tope de una corrida completa al día (migración 0039): si ya se tocó la OJV hoy con este mismo tipo, no se repite.
// --listar no cuenta (no toca el PJUD, solo lee la cola) así que pide permiso después de ese atajo.
let corridaId: string | null = null;
if (!args.includes("--listar")) {
  const { data: idCorrida, error: eCorrida } = await supabase.rpc("pjud_corrida_iniciar", { p_tipo: "sync", p_origen: opt("--origen") ?? null });
  if (eCorrida) {
    console.error(`Detención total: ${eCorrida.message}`);
    await supabase.auth.signOut();
    process.exit(1);
  }
  corridaId = idCorrida as string;
}

// La cola priorizada la arma la base (pjud_cola_sync): primero las causas con actuaciones recientes, luego las que llevan
// más tiempo sin sincronizar; las que el PJUD no encontró (rol/tribunal) quedan fuera hasta que se corrija el dato.
const { data: cola, error } = await supabase.rpc("pjud_cola_sync", { p_limite: null, p_desde: opt("--desde") ?? null });
if (error) {
  console.error("No se pudo leer la cola de sincronización:", error.message);
  process.exit(1);
}
type Fila = { client_id: string; rol: string; tribunal: string; synced_at: string | null; prioridad: number };
let filas = (cola ?? []) as Fila[];
if (mes) {
  const { data: delMes } = await supabase.from("legal_clients").select("id").gte("intake_date", `${mes}-01`).lt("intake_date", mesSiguiente(mes));
  const ids = new Set((delMes ?? []).map((x) => x.id as string));
  filas = filas.filter((f) => ids.has(f.client_id));
}
const pendientes = filas.filter((f) => !solo || f.rol.trim().toUpperCase() === solo).slice(0, limite).map((f) => ({ id: f.client_id, rol: f.rol, tribunal: f.tribunal, synced_at: f.synced_at, prioridad: f.prioridad }));
if (args.includes("--listar")) {
  console.log(`Cola de sincronización: ${filas.length} causas; ★ = con actuaciones recientes (van primero)`);
  pendientes.forEach((c, i) => console.log(`${String(i + 1).padStart(3)}  ${c.prioridad === 0 ? "★" : " "}  ${c.rol.padEnd(14)} ${c.tribunal.padEnd(40).slice(0, 40)}  ${c.synced_at ? "sync " + c.synced_at.slice(0, 16).replace("T", " ") : "nunca"}`));
  await supabase.auth.signOut();
  process.exit(0);
}
const { data: tribunales } = await supabase.from("pjud_tribunales").select("codigo, nombre_norm");
const codigoDe = new Map((tribunales ?? []).map((t) => [t.nombre_norm as string, t.codigo as number]));
console.log(`${hora()} · ${pendientes.length} causas por sincronizar (${filas.length} en la cola; ${filas.filter((f) => f.prioridad === 0).length} con actuaciones recientes van primero${mes ? `; solo ingresadas en ${mes}` : ""})`);

const cliente = new PjudClient(opt("--contacto") ?? "juridico@deudalibre.cl");
let ok = 0;
let fallas = 0;
let bloqueado = false;
for (const c of pendientes) {
  const rol = c.rol.trim().toUpperCase();
  try {
    const codigo = codigoDe.get(normalizarTribunal(c.tribunal)) ?? 0;
    const d = await cliente.detalleCausa(rol, c.tribunal, codigo);
    const { error: e } = await supabase.rpc("pjud_guardar", { p_client: c.id, p_data: { ...d, tribunal_codigo: codigo || null } });
    if (e) throw new Error(`No se pudo guardar: ${e.message}`);
    ok++;
    const n = d.cuadernos.reduce((a, q) => a + q.actuaciones.length, 0);
    console.log(`OK   ${rol} · ${d.estado_proc || "?"} · ${d.cuadernos.length} cuaderno(s) · ${n} actuaciones${codigo ? "" : " · (sin código de tribunal: buscado por nombre)"}`);
  } catch (e) {
    fallas++;
    const msg = (e as Error).message;
    console.log(`FAIL ${rol} · ${e instanceof CausaNoEncontrada ? "no encontrada" : e instanceof PjudBloqueado ? "BLOQUEO" : "error"}: ${msg.slice(0, 200)}`);
    await supabase.rpc("pjud_guardar", { p_client: c.id, p_data: null, p_error: msg });
    if (e instanceof PjudBloqueado) {
      bloqueado = true;
      console.log("Detención total: no se sigue consultando. Revisar antes de reintentar.");
      break;
    }
  }
}
console.log(`\n${hora()} · ${ok} sincronizadas · ${fallas} con error · ${cliente.bitacora.length} consultas a la OJV en ${Math.round((Date.now() - inicio) / 60000)} min`);
if (!args.includes("--listar")) {
  const completa = pendientes.length > 0 && ok + fallas === pendientes.length && !bloqueado;
  const estado = bloqueado ? "bloqueada" : completa ? "completa" : "parcial";
  await supabase.rpc("pjud_corrida_terminar", { p_id: corridaId, p_estado: estado, p_ok: ok, p_fallas: fallas, p_peticiones: cliente.bitacora.length });
}
await supabase.auth.signOut();

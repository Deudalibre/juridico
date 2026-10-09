// Sincroniza con el Poder Judicial TODAS las causas con rol y tribunal, desde este computador (el cortafuegos del
// PJUD rechaza las IP de Vercel con un desafío F5, así que la lectura tiene que salir desde Chile).
//   npx -y tsx scripts/pjud-sync.mts --cuenta C:/ruta/credenciales.txt [--limite 40] [--solo C-12971-2026] [--contacto correo]
// Guarda cada lectura (o su error) con pjud_guardar como el usuario de la cuenta (necesita legal.edit). Respeta los 5
// segundos entre consultas: unas 231 causas tardan ~20 minutos. Pensado para el Programador de tareas de Windows a las 12:00.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { CausaNoEncontrada, PjudBloqueado, PjudClient, normalizarTribunal } from "../src/lib/pjud";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2).map((x) => x.replace(/^["']|["']$/g, ""))));
const cuenta = opt("--cuenta");
if (!cuenta || !existsSync(cuenta)) {
  console.error("Falta --cuenta <archivo con Usuario:/Correo: y Clave:>");
  process.exit(1);
}
const cred = readFileSync(cuenta, "utf8");
const email = cred.match(/(?:Correo|Usuario):\s*(\S+)/)?.[1] ?? "";
const password = cred.match(/Clave:\s*(\S+)/)?.[1] ?? "";
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await supabase.auth.signInWithPassword({ email, password });
if (login.error) {
  console.error("No se pudo iniciar sesión:", login.error.message);
  process.exit(1);
}
const limite = Number(opt("--limite") ?? 1000);
const solo = opt("--solo")?.toUpperCase();
const inicio = Date.now();
const hora = () => new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" });

// Causas con rol y tribunal, las más antiguas por sincronización primero (las nunca leídas van al inicio)
const { data: causas, error } = await supabase.from("legal_clients").select("id, rol, tribunal, pjud_causa_data(synced_at, error_at)").is("archived_at", null).not("rol", "is", null).not("tribunal", "is", null).limit(2000);
if (error) {
  console.error("No se pudo leer la cartera:", error.message);
  process.exit(1);
}
type Fila = { id: string; rol: string; tribunal: string; pjud_causa_data: { synced_at: string | null; error_at: string | null } | { synced_at: string | null; error_at: string | null }[] | null };
const marca = (f: Fila) => {
  const d = Array.isArray(f.pjud_causa_data) ? f.pjud_causa_data[0] : f.pjud_causa_data;
  return Math.max(Date.parse(d?.synced_at ?? "") || 0, Date.parse(d?.error_at ?? "") || 0);
};
const pendientes = ((causas ?? []) as Fila[])
  .filter((f) => /^[A-Z]-\d+-\d{4}$/i.test(f.rol.trim()) && (!solo || f.rol.trim().toUpperCase() === solo))
  .sort((a, b) => marca(a) - marca(b))
  .slice(0, limite);
const { data: tribunales } = await supabase.from("pjud_tribunales").select("codigo, nombre_norm");
const codigoDe = new Map((tribunales ?? []).map((t) => [t.nombre_norm as string, t.codigo as number]));
console.log(`${hora()} · ${pendientes.length} causas por sincronizar (${(causas ?? []).length} con rol y tribunal)`);

const cliente = new PjudClient(opt("--contacto") ?? "juridico@deudalibre.cl");
let ok = 0;
let fallas = 0;
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
      console.log("Detención total: no se sigue consultando. Revisar antes de reintentar.");
      break;
    }
  }
}
console.log(`\n${hora()} · ${ok} sincronizadas · ${fallas} con error · ${cliente.bitacora.length} consultas a la OJV en ${Math.round((Date.now() - inicio) / 60000)} min`);
await supabase.auth.signOut();

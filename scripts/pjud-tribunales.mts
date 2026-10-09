// Carga en la app los códigos de tribunal civil de la Oficina Judicial Virtual (cortes → tribunales) y dice cuáles de
// los tribunales escritos en las causas no calzan con ninguno. Se corre una vez (y cuando el PJUD cambie la lista):
//   npx -y tsx scripts/pjud-tribunales.mts --cuenta C:/ruta/credenciales.txt [--contacto correo]
// Son unas 20 consultas a la OJV (una por corte), a 5 segundos cada una.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { PjudClient, normalizarTribunal } from "../src/lib/pjud";

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

const cliente = new PjudClient(opt("--contacto") ?? "juridico@deudalibre.cl");
const cortes = await cliente.listarCortes();
console.log(`Cortes: ${cortes.length}`);
const lista: { codigo: number; nombre: string; nombre_norm: string; corte: number; corte_nombre: string }[] = [];
for (const c of cortes) {
  const ts = await cliente.listarTribunalesCiviles(c.codigo);
  console.log(`  ${c.nombre}: ${ts.length} tribunales civiles`);
  for (const t of ts) lista.push({ codigo: t.codigo, nombre: t.nombre, nombre_norm: normalizarTribunal(t.nombre), corte: c.codigo, corte_nombre: c.nombre });
}
const { data: n, error } = await supabase.rpc("pjud_guardar_tribunales", { p_lista: lista });
if (error) {
  console.error("No se pudo guardar:", error.message);
  process.exit(1);
}
console.log(`Guardados ${n} tribunales en pjud_tribunales (${cliente.bitacora.length} consultas a la OJV).`);

// Qué tribunales de las causas no calzan
const { data: causas } = await supabase.from("legal_clients").select("tribunal").is("archived_at", null).not("tribunal", "is", null);
const normas = new Set(lista.map((t) => t.nombre_norm));
const sinCalce = new Map<string, number>();
for (const c of causas ?? []) {
  const nombre = String(c.tribunal).trim();
  if (!normas.has(normalizarTribunal(nombre))) sinCalce.set(nombre, (sinCalce.get(nombre) ?? 0) + 1);
}
console.log(`\nTribunales de las causas: ${new Set((causas ?? []).map((c) => String(c.tribunal).trim())).size} distintos · sin calce: ${sinCalce.size}`);
for (const [nombre, k] of Array.from(sinCalce.entries()).sort((a, b) => b[1] - a[1])) console.log(`  ✗ ${nombre} (${k} ${k === 1 ? "causa" : "causas"}) · normalizado: «${normalizarTribunal(nombre)}»`);
await supabase.auth.signOut();

// Prueba de humo: acceso por rol a la app jurídica (con npm run dev en :3001).
// Crea un usuario jurídico y un ejecutivo temporales, un cliente de prueba, y los borra al terminar.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const sql = (q) => JSON.parse(execSync(`node scripts/db-migrate.mjs sql ${JSON.stringify(q)}`, { encoding: "utf8" }) || "null");
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const stamp = Date.now();
const BASE = "http://localhost:3001";
const ok = (label, cond, extra = "") => console.log(`${cond ? "OK  " : "FAIL"} ${label}${extra ? " · " + extra : ""}`);

async function user(name, role) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const email = `e2e.${name}.${stamp}@gmail.com`;
  sql(`insert into invitations (email, role) values ('${email}', '${role}')`);
  const r = await c.auth.signUp({ email, password: "Prueba-12345!", options: { data: { full_name: `JUR ${name}` } } });
  if (r.error) throw new Error(r.error.message);
  return { c, id: r.data.user.id, cookie: `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(r.data.session)).toString("base64url")}` };
}
const page = async (u, p) => {
  const res = await fetch(BASE + p, { headers: { cookie: u.cookie }, redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, html, text: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
};

try {
  const jur = await user("juridico", "juridico");
  const eje = await user("ejecutivo", "ejecutivo");
  const cl = await jur.c.from("legal_clients").insert({ full_name: "JUR Cliente Prueba", rut: "12.345.678-5", procedure_type: "Renegociación" }).select().single();
  ok("Jurídico crea un cliente en tramitación", !cl.error, cl.error?.message);
  const p1 = await page(jur, "/clientes");
  ok("Jurídico · /clientes muestra el cliente y el menú (sin Configuración)", p1.status === 200 && p1.html.includes("JUR Cliente Prueba") && /Clientes.*Plantillas.*Documentos/.test(p1.text) && !/Configuración/.test(p1.text), String(p1.status));
  const p2 = await page(eje, "/clientes");
  ok("Ejecutivo del CRM · sin acceso al área jurídica y sin datos", p2.status === 200 && /Sin acceso al área jurídica/.test(p2.text) && !p2.html.includes("JUR Cliente Prueba"), String(p2.status));
  const seen = await eje.c.from("legal_clients").select("id");
  ok("Ejecutivo · la base tampoco le entrega clientes legales (RLS)", (seen.data ?? []).length === 0);
  const ficha = await page(jur, `/clientes/${cl.data?.id}`);
  ok("Jurídico · ficha del cliente con pestañas y antecedentes", ficha.status === 200 && /Antecedentes.*Causa.*Documentos.*Historial/.test(ficha.text) && /12\.345\.678-5/.test(ficha.text), String(ficha.status));
  const upd = await jur.c.from("legal_clients").update({ rut: "123456785", tribunal: "1º Juzgado Civil" }).eq("id", cl.data?.id).select();
  ok("Jurídico · edita antecedentes (RLS legal.edit)", (upd.data ?? []).length === 1, upd.error?.message);
  const p3 = await page(jur, "/configuracion");
  ok("Jurídico · /configuracion denegado (solo legal.settings)", p3.status === 307 || /NEXT_REDIRECT|Sin acceso/.test(p3.html), String(p3.status));
  const p4 = await page(jur, "/plantillas");
  ok("Jurídico · /plantillas indica que el mapa está pendiente", p4.status === 200 && /Pendiente: mapa de plantillas/.test(p4.text));
  const p5 = await fetch(`${BASE}/clientes`, { redirect: "manual" });
  ok("Sin sesión → /login", p5.status === 307 && /\/login/.test(p5.headers.get("location") ?? ""), String(p5.status));
} catch (e) {
  console.log("ERROR " + e.message);
} finally {
  sql(`delete from legal_clients where full_name like 'JUR %'`);
  sql(`delete from auth.users where email like 'e2e.%.${stamp}@gmail.com'`);
  sql(`delete from invitations where email like 'e2e.%.${stamp}@gmail.com'`);
  process.exit(0);
}

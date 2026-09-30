// Ficha del cliente (etapa 1): Clave Única cifrada con auditoría, enlaces externos, alta manual y
// pantallas. Con npm run dev en :3001. Crea usuarios y clientes temporales y los borra al terminar.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const sql = (q) => JSON.parse(execSync(`node scripts/db-migrate.mjs sql ${JSON.stringify(q)}`, { encoding: "utf8" }) || "null");
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const stamp = Date.now();
const BASE = "http://localhost:3001";
let fails = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${extra ? " · " + extra : ""}`);
};

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
  const cl = await jur.c
    .from("legal_clients")
    .insert({ full_name: "JUR Ficha Prueba", rut: "123456785", procedure_type: "Liquidación voluntaria", rol: "C-9999-2026", tribunal: "1º Juzgado Civil", intake_date: "2026-09-12" })
    .select()
    .single();
  ok("Cliente de prueba creado con procedimiento, rol, tribunal y fecha de ingreso", !cl.error, cl.error?.message);
  const id = cl.data?.id;

  // Clave Única: guardar, leer, auditar
  const set = await jur.c.rpc("legal_set_clave_unica", { p_client: id, p_value: "clave-secreta-123" });
  ok("Jurídico guarda la Clave Única (RPC)", !set.error, set.error?.message);
  const row = sql(`select clave_unica_secret_id from legal_clients where id = '${id}'`)[0];
  ok("En legal_clients solo queda el id del secreto", Boolean(row?.clave_unica_secret_id) && row.clave_unica_secret_id !== "clave-secreta-123");
  const vaultRow = sql(`select secret from vault.secrets where id = '${row?.clave_unica_secret_id}'`)[0];
  ok("En vault.secrets el valor está cifrado (no es el texto plano)", vaultRow && vaultRow.secret !== "clave-secreta-123");
  const get = await jur.c.rpc("legal_get_clave_unica", { p_client: id });
  ok("Jurídico la lee de vuelta descifrada", !get.error && get.data === "clave-secreta-123", get.error?.message ?? String(get.data));
  const audit = sql(`select action from audit_log where entity = 'legal_cliente' and entity_id = '${id}' and action like 'cliente.clave_unica.%' order by at`);
  ok("Auditoría: guardada y vista", audit.some((a) => a.action === "cliente.clave_unica.guardada") && audit.some((a) => a.action === "cliente.clave_unica.vista"), JSON.stringify(audit.map((a) => a.action)));

  // Cambiar y quitar
  const upd = await jur.c.rpc("legal_set_clave_unica", { p_client: id, p_value: "otra-clave-456" });
  const get2 = await jur.c.rpc("legal_get_clave_unica", { p_client: id });
  ok("Cambiar la Clave Única conserva un solo secreto y devuelve el nuevo valor", !upd.error && get2.data === "otra-clave-456");
  const direct = await jur.c.from("legal_clients").update({ clave_unica_secret_id: null }).eq("id", id).select();
  ok("Un update directo del id del secreto se rechaza", Boolean(direct.error) || (direct.data ?? []).length === 0, direct.error?.message);
  const rm = await jur.c.rpc("legal_set_clave_unica", { p_client: id, p_value: "" });
  const afterRm = sql(`select clave_unica_secret_id from legal_clients where id = '${id}'`)[0];
  const vaultGone = sql(`select count(*)::int as n from vault.secrets where id = '${row?.clave_unica_secret_id}'`)[0];
  ok("Quitar la Clave Única borra el secreto de la bóveda", !rm.error && afterRm?.clave_unica_secret_id === null && vaultGone?.n === 0);

  // Ejecutivo del CRM: ni ve el cliente ni puede usar las funciones
  await jur.c.rpc("legal_set_clave_unica", { p_client: id, p_value: "clave-secreta-789" });
  const ejeGet = await eje.c.rpc("legal_get_clave_unica", { p_client: id });
  ok("Ejecutivo no puede leer la Clave Única", Boolean(ejeGet.error), ejeGet.error?.message);
  const ejeSet = await eje.c.rpc("legal_set_clave_unica", { p_client: id, p_value: "x" });
  ok("Ejecutivo no puede guardar la Clave Única", Boolean(ejeSet.error), ejeSet.error?.message);

  // Enlaces externos
  const links = await jur.c.from("legal_clients").update({ drive_folder_url: "https://drive.google.com/drive/folders/abc", pjud_url: "https://oficinajudicialvirtual.pjud.cl/x" }).eq("id", id).select();
  ok("Enlaces de carpeta y ficha jurídica se guardan", !links.error && links.data?.[0]?.pjud_url?.includes("pjud"), links.error?.message);

  // Pantallas
  const lista = await page(jur, "/clientes");
  ok("Lista: cabecera, procedimiento como etiqueta, rol, tribunal, ingreso y acciones", lista.status === 200 && /JUR Ficha Prueba/.test(lista.text) && /Liquidación voluntaria/.test(lista.text) && /C-9999-2026/.test(lista.text) && /Carpeta/.test(lista.text) && /Ficha jurídica/.test(lista.text) && /12 sept?\.? 2026/i.test(lista.text), String(lista.status));
  const busca = await page(jur, "/clientes?q=C-9999");
  ok("Lista: búsqueda por rol", busca.status === 200 && /JUR Ficha Prueba/.test(busca.text) && /1 coinciden/.test(busca.text));
  const ficha = await page(jur, `/clientes/${id}`);
  ok("Ficha: cabecera con etiqueta, botones y resumen", ficha.status === 200 && /Carpeta del cliente/.test(ficha.text) && /Ficha jurídica/.test(ficha.text) && /Clave Única/.test(ficha.text) && /Abogado a cargo/.test(ficha.text) && /Ingresada el 12 sept?\.? 2026/i.test(ficha.text), String(ficha.status));
  ok("Ficha: la Clave Única aparece oculta, nunca en el HTML", ficha.status === 200 && /••••••••/.test(ficha.text) && !/clave-secreta-789/.test(ficha.html));
  const causa = await page(jur, `/clientes/${id}?tab=Causa`);
  ok("Ficha: pestaña Causa marcada como siguiente etapa", causa.status === 200 && /siguiente etapa/.test(causa.text));
  const nuevo = await page(jur, "/clientes/nuevo");
  ok("Alta manual: formulario con procedimiento y fecha de ingreso", nuevo.status === 200 && /Nuevo cliente/.test(nuevo.text) && /Fecha de ingreso/.test(nuevo.text));
  const ejeLista = await page(eje, "/clientes");
  ok("Ejecutivo del CRM: sin acceso a la lista", ejeLista.status === 307 || /Sin acceso/.test(ejeLista.text), String(ejeLista.status));
} catch (e) {
  fails++;
  console.log("ERROR " + e.message);
} finally {
  sql(`delete from legal_clients where full_name like 'JUR %'`);
  sql(`delete from vault.secrets where name like 'clave_unica:%' and id not in (select clave_unica_secret_id from legal_clients where clave_unica_secret_id is not null)`);
  sql(`delete from auth.users where email like 'e2e.%.${stamp}@gmail.com'`);
  sql(`delete from invitations where email like 'e2e.%.${stamp}@gmail.com'`);
  console.log(fails ? `${fails} fallo(s)` : "Todo OK");
  process.exit(fails ? 1 : 0);
}

// Plantillas Word con variables: librería docx (leer, marcar, renombrar, quitar, generar), tabla y bucket con
// permisos, y pantallas de lista y editor. Con npm run dev en :3001. Crea usuarios y plantillas temporales y los borra.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { sampleDocx } from "./lib/docx-sample.mjs";
import { readDocx, docText, markVariable, replaceVariable, templateError, renderDocx } from "../src/lib/docx.ts";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const sql = (q) => JSON.parse(execSync(`node scripts/db-migrate.mjs sql ${JSON.stringify(q)}`, { encoding: "utf8" }) || "null");
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const stamp = Date.now();
const BASE = "http://localhost:3001";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
let fails = 0;
const ok = (label, cond, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${extra ? " · " + extra : ""}`);
};
const vars = (buf) => Array.from(new Set(Array.from(docText(readDocx(buf)).matchAll(/\{([a-z][a-z0-9_]{0,39})\}/g), (m) => m[1])));

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

let ids = [];
let adm;
try {
  // 1. Librería docx sobre un Word sintético (runs partidos, negrita, tabulador, tabla, párrafo vacío, {rut} escrito en Word)
  const buf = sampleDocx();
  const doc = readDocx(buf);
  ok("Lee el Word: 9 párrafos, una tabla, formato por run", doc.paragraphs === 9 && doc.blocks[3]?.kind === "table" && doc.blocks[1].runs.some((r) => r.b && r.i), JSON.stringify(doc.blocks.map((b) => b.kind)));
  ok("Título y alineación", doc.blocks[0].heading === true && doc.blocks[0].align === "center" && doc.blocks[5].align === "right");
  ok("Tabulador y entidades XML (&) en el texto", doc.blocks[2].text === "Deudas:\t$ 4.500.000 & intereses", JSON.stringify(doc.blocks[2].text));
  ok("Detecta la variable {rut} escrita a mano en Word", vars(buf).join() === "rut");
  ok("La plantilla compila en docxtemplater", templateError(buf) === null);
  const p1 = doc.blocks[1];
  const s = p1.text.indexOf("Nombre Completo");
  const b2 = markVariable(buf, 1, s, s + 15, "nombre_completo");
  const d2 = readDocx(b2);
  ok("Marca un tramo que cruza dos runs con formato distinto", d2.blocks[1].text.includes("Yo, {nombre_completo}, cédula") && d2.blocks[1].runs.find((r) => r.s === 4)?.b === true, d2.blocks[1].text);
  ok("El resto del párrafo conserva su texto y formato", d2.blocks[1].text.endsWith("declaro bajo juramento:") && d2.blocks[1].runs.length === 5);
  const sig = d2.blocks[5];
  const s2 = sig.text.indexOf("12 de septiembre de 2026");
  const b3 = markVariable(b2, sig.i, s2, s2 + 24, "fecha_hoy");
  ok("Marca en un párrafo posterior a la tabla (índice global)", readDocx(b3).blocks[5].text === "Firmado en Santiago, a {fecha_hoy}." && templateError(b3) === null);
  const cell = readDocx(b3).blocks[3].rows[1][0][0];
  const b4 = markVariable(b3, cell.i, 0, cell.text.length, "acreedor");
  ok("Marca dentro de una celda de tabla", readDocx(b4).blocks[3].rows[1][0][0].text === "{acreedor}");
  const ren = replaceVariable(b4, "rut", "{rut_deudor}");
  ok("Renombrar variable cambia sus marcadores", ren.count === 1 && vars(ren.buf).includes("rut_deudor") && !vars(ren.buf).includes("rut"));
  const rm = replaceVariable(ren.buf, "rut_deudor", "RUT del deudor");
  ok("Quitar variable devuelve el texto de la etiqueta", rm.count === 1 && readDocx(rm.buf).blocks[1].text.includes("N° RUT del deudor,"));
  const out = readDocx(renderDocx(b4, { nombre_completo: "Ana Muñoz", rut: "12.345.678-5", fecha_hoy: "1 de octubre de 2026", acreedor: "Banco Prueba" }));
  ok("Genera el Word con datos", out.blocks[1].text.startsWith("Yo, Ana Muñoz, cédula de identidad N° 12.345.678-5") && out.blocks[5].text === "Firmado en Santiago, a 1 de octubre de 2026." && out.blocks[3].rows[1][0][0].text === "Banco Prueba");
  let err = "";
  try {
    markVariable(buf, 1, 0, 9999, "x");
  } catch (e) {
    err = e.message;
  }
  ok("Rechaza una selección fuera del párrafo", /no coincide/.test(err), err);
  try {
    markVariable(buf, 7, 0, 1, "x");
  } catch (e) {
    err = e.message;
  }
  ok("Rechaza marcar en un párrafo vacío", /vacío/.test(err), err);

  // 2. Tabla y bucket con permisos
  const jur = await user("juridico", "juridico");
  const eje = await user("ejecutivo", "ejecutivo");
  adm = await user("admin", "administrador");
  const id = crypto.randomUUID();
  ids.push(id);
  const path = `${id}/v1.docx`;
  const up = await jur.c.storage.from("legal-templates").upload(path, buf, { contentType: DOCX });
  ok("Jurídico sube el .docx al bucket legal-templates", !up.error, up.error?.message);
  const upEje = await eje.c.storage.from("legal-templates").upload(`${crypto.randomUUID()}/v1.docx`, buf, { contentType: DOCX });
  ok("Un ejecutivo del CRM no puede subir plantillas", Boolean(upEje.error), upEje.error?.message);
  const upPdf = await jur.c.storage.from("legal-templates").upload(`${crypto.randomUUID()}/v1.docx`, Buffer.from("%PDF-1.4"), { contentType: "application/pdf" });
  ok("El bucket solo admite .docx", Boolean(upPdf.error), upPdf.error?.message);
  const ins = await jur.c
    .from("legal_templates")
    .insert({ id, name: "JUR Plantilla prueba", procedure_type: "Liquidación voluntaria", storage_path: path, file_name: "prueba.docx", file_size: buf.length, variables: [{ name: "rut", label: "RUT", type: "texto", source: "rut" }] })
    .select()
    .single();
  ok("Jurídico registra la plantilla (RLS documents.edit)", !ins.error && ins.data?.version === 1, ins.error?.message);
  const insEje = await eje.c.from("legal_templates").insert({ name: "x", storage_path: "x/plantilla.docx" }).select();
  ok("Un ejecutivo no crea plantillas", Boolean(insEje.error), insEje.error?.message);
  const seeEje = await eje.c.from("legal_templates").select("id").eq("id", id);
  ok("Un ejecutivo no ve las plantillas", !seeEje.error && (seeEje.data ?? []).length === 0);
  const audit = sql(`select action from audit_log where entity = 'plantilla' and entity_id = '${id}' order by at`);
  ok("Auditoría: plantilla.creada", audit.some((a) => a.action === "plantilla.creada"), JSON.stringify(audit));
  const upd = await jur.c.from("legal_templates").update({ version: 2, variables: [] }).eq("id", id).select().single();
  const audit2 = sql(`select action from audit_log where entity = 'plantilla' and entity_id = '${id}' and action = 'plantilla.editada'`);
  ok("Cambiar archivo/variables queda en auditoría (plantilla.editada) y updated_at sube", !upd.error && audit2.length === 1 && upd.data.updated_at > upd.data.created_at, upd.error?.message);
  const delJur = await jur.c.from("legal_templates").delete().eq("id", id).select();
  ok("Jurídico no elimina plantillas (solo documents.manage)", !delJur.error && (delJur.data ?? []).length === 0);
  const signed = await jur.c.storage.from("legal-templates").createSignedUrl(path, 60);
  ok("Jurídico obtiene enlace de descarga del Word", !signed.error && Boolean(signed.data?.signedUrl), signed.error?.message);

  // 3. Pantallas
  const list = await page(jur, "/plantillas");
  ok("Lista de plantillas: muestra la plantilla con su procedimiento", list.status === 200 && /JUR Plantilla prueba/.test(list.text) && /Liquidación voluntaria/.test(list.text), String(list.status));
  const editor = await page(jur, `/plantillas/${id}`);
  // El documento lo dibuja el navegador (docx-preview) a partir del .docx: el HTML del servidor trae la cabecera,
  // el conteo de párrafos y el panel de variables; el texto del Word ya no viene en el HTML
  ok("Editor: cabecera, párrafos del Word y panel de variables", editor.status === 200 && /Editor de plantilla/.test(editor.text) && /9 párrafos/.test(editor.text) && /Variables/.test(editor.text), String(editor.status));
  ok("Editor: la variable {rut} escrita en Word aparece en el panel de variables", /\{rut\}/.test(editor.html));
  // 4. Catálogo de variables del estudio (migración 0022)
  const cat = await jur.c.from("legal_variables").insert({ name: "jur_domicilio", label: "JUR Domicilio", type: "texto", source: null, hint: "Calle y número" }).select().single();
  ok("Catálogo: jurídico crea una variable del estudio", !cat.error && cat.data?.name === "jur_domicilio", cat.error?.message);
  const catEje = await eje.c.from("legal_variables").select("name").eq("name", "jur_domicilio");
  ok("Un ejecutivo no ve el catálogo", !catEje.error && (catEje.data ?? []).length === 0);
  const catPage = await page(jur, "/plantillas/variables");
  ok("Pantalla «Variables del estudio»: la variable, su pista y las automáticas de la ficha", catPage.status === 200 && /jur_domicilio/.test(catPage.text) && /Calle y número/.test(catPage.text) && /nombre_completo/.test(catPage.text), String(catPage.status));
  const editor2 = await page(jur, `/plantillas/${id}`);
  ok("Editor: recibe el catálogo para ofrecerlo al marcar", editor2.status === 200 && /jur_domicilio/.test(editor2.html));
  const auditCat = sql(`select action from audit_log where entity = 'variable' and entity_id = 'jur_domicilio'`);
  ok("Auditoría: variable.creada", auditCat.some((x) => x.action === "variable.creada"), JSON.stringify(auditCat));
  const delCat = await jur.c.from("legal_variables").delete().eq("name", "jur_domicilio").select();
  ok("Jurídico no quita variables del catálogo (solo documents.manage)", !delCat.error && (delCat.data ?? []).length === 0);
  const ejeList = await page(eje, "/plantillas");
  ok("Un ejecutivo no entra a Plantillas", ejeList.status === 307 || /Sin acceso/.test(ejeList.text), String(ejeList.status));
  const bad = await page(jur, `/plantillas/${crypto.randomUUID()}`);
  ok("Plantilla inexistente → pantalla «No encontrado» (con loading.tsx el estado llega como 200, igual que en el CRM)", bad.status === 404 || (bad.status === 200 && /No encontrado/.test(bad.html)), String(bad.status));
} catch (e) {
  fails++;
  console.log("ERROR " + e.message);
} finally {
  try {
    // Cada versión del Word es un archivo (v1.docx, v2.docx…): se vacía la carpeta de las plantillas de prueba
    // y las carpetas huérfanas (subidas sin fila, como la del ejecutivo rechazado o la del .pdf)
    sql("delete from legal_variables where name like 'jur_%'");
    const keep = new Set(sql(`select id::text as id from legal_templates where name not like 'JUR %'`).map((r) => r.id));
    if (adm) {
      const { data } = await adm.c.storage.from("legal-templates").list("", { limit: 200 });
      for (const f of data ?? []) {
        if (keep.has(f.name)) continue;
        const { data: inner } = await adm.c.storage.from("legal-templates").list(f.name, { limit: 1000 });
        if (inner?.length) await adm.c.storage.from("legal-templates").remove(inner.map((x) => `${f.name}/${x.name}`));
      }
    }
  } catch (e) {
    console.log("aviso: no se pudo limpiar el bucket · " + e.message);
  }
  sql(`delete from legal_templates where name like 'JUR %'`);
  sql(`delete from auth.users where email like 'e2e.%.${stamp}@gmail.com'`);
  sql(`delete from invitations where email like 'e2e.%.${stamp}@gmail.com'`);
  console.log(fails ? `${fails} fallo(s)` : "Todo OK");
  process.exit(fails ? 1 : 0);
}

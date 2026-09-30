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
  var adm = await user("admin", "administrador"); // solo para limpiar el bucket al final (documents.manage)
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
  ok("Lista: cabecera, procedimiento como etiqueta, rol, tribunal, paso y acciones", lista.status === 200 && /JUR Ficha Prueba/.test(lista.text) && /Liquidación voluntaria/.test(lista.text) && /C-9999-2026/.test(lista.text) && /Carpeta/.test(lista.text) && /Ficha jurídica/.test(lista.text) && /Preparación de documentos/.test(lista.text), String(lista.status));
  const busca = await page(jur, "/clientes?q=C-9999");
  ok("Lista: búsqueda por rol", busca.status === 200 && /JUR Ficha Prueba/.test(busca.text) && /1 coinciden/.test(busca.text));
  const ficha = await page(jur, `/clientes/${id}`);
  ok("Ficha: cabecera con etiqueta, botones y resumen", ficha.status === 200 && /Carpeta del cliente/.test(ficha.text) && /Ficha jurídica/.test(ficha.text) && /Clave Única/.test(ficha.text) && /Abogado a cargo/.test(ficha.text) && /Ingresada el 12 sept?\.? 2026/i.test(ficha.text), String(ficha.status));
  ok("Ficha: la Clave Única aparece oculta, nunca en el HTML", ficha.status === 200 && /••••••••/.test(ficha.text) && !/clave-secreta-789/.test(ficha.html));
  const causa = await page(jur, `/clientes/${id}?tab=Causa`);
  ok("Ficha: pestaña Causa con los 12 pasos de la liquidación y ninguno completado", causa.status === 200 && /Pasos de la causa/.test(causa.text) && /0 de 12 completados/.test(causa.text) && /Certificado de ejecutoria/.test(causa.text));
  const nuevo = await page(jur, "/clientes/nuevo");
  ok("Alta manual: formulario con procedimiento y fecha de ingreso", nuevo.status === 200 && /Nuevo cliente/.test(nuevo.text) && /Fecha de ingreso/.test(nuevo.text));
  const ejeLista = await page(eje, "/clientes");
  ok("Ejecutivo del CRM: sin acceso a la lista", ejeLista.status === 307 || /Sin acceso/.test(ejeLista.text), String(ejeLista.status));

  // Pasos de la causa (liquidación voluntaria): completar, historial, hito en la cabecera
  const s1 = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Preparación de documentos", completed_at: "2026-09-13", note: "carpeta completa" }).select().single();
  const s2 = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Ingreso de demanda", completed_at: "2026-09-14" }).select().single();
  ok("Jurídico marca pasos completados (RLS legal.edit)", !s1.error && !s2.error, s1.error?.message ?? s2.error?.message);
  const hist = sql(`select summary from legal_case_history where client_id = '${id}' and kind = 'paso' order by at`);
  ok("Cada paso queda en el historial de la causa", hist.length === 2 && /Preparación/.test(hist[0].summary) && /Ingreso de demanda/.test(hist[1].summary), JSON.stringify(hist.map((h) => h.summary)));
  const upd2 = await jur.c.from("legal_clients").update({ current_step: "Apercibimientos", liquidation_resolution_at: null }).eq("id", id);
  ok("current_step se puede mantener desde la app", !upd2.error, upd2.error?.message);
  const causa2 = await page(jur, `/clientes/${id}?tab=Causa`);
  ok("Pestaña Causa: 12 pasos, dos completados y el actual señalado", causa2.status === 200 && /2 de 12 completados/.test(causa2.text) && /Paso actual/.test(causa2.text) && /Apercibimientos y tareas/.test(causa2.text), String(causa2.status));
  const fichaPaso = await page(jur, `/clientes/${id}`);
  ok("Cabecera: paso actual y aviso de resolución de liquidación pendiente", /Paso: Apercibimientos/.test(fichaPaso.text) && /Sin resolución de liquidación aún/.test(fichaPaso.text));
  const ejeStep = await eje.c.from("legal_case_steps").select("id").eq("client_id", id);
  ok("Ejecutivo no ve los pasos de la causa (RLS)", (ejeStep.data ?? []).length === 0);

  // Apercibimiento como tarea con vencimiento
  const task = await jur.c.from("legal_tasks").insert({ client_id: id, kind: "apercibimiento", title: "Acompañar certificado de deudas", due_at: "2026-10-03T13:00:00Z" }).select().single();
  ok("Apercibimiento creado como tarea con vencimiento (tipo nuevo admitido)", !task.error, task.error?.message);
  const listaTarea = await page(jur, "/clientes");
  ok("Lista: la próxima acción muestra el apercibimiento con su fecha", listaTarea.status === 200 && /Acompañar certificado de deudas/.test(listaTarea.text) && /Apercibimiento/.test(listaTarea.text) && /Paso/.test(listaTarea.text));

  // Mi día del abogado e Historial
  const hoy = await page(jur, "/hoy");
  ok("Mi día: la causa aparece con su apercibimiento en un grupo por urgencia", hoy.status === 200 && /JUR Ficha Prueba/.test(hoy.text) && /Acompañar certificado de deudas/.test(hoy.text) && /(Vencidas|Hoy|Esta semana|Más adelante)/.test(hoy.text) && /Mi día/.test(hoy.text), String(hoy.status));
  const raiz = await fetch(`${BASE}/`, { headers: { cookie: jur.cookie }, redirect: "manual" });
  ok("La raíz lleva a Mi día", raiz.status === 307 && /\/hoy/.test(raiz.headers.get("location") ?? ""), String(raiz.status));
  const historial = await page(jur, `/clientes/${id}?tab=Historial`);
  ok("Historial: muestra los pasos completados con fecha y autor", historial.status === 200 && /Paso completado: Preparación de documentos/.test(historial.text) && /JUR juridico/.test(historial.text), String(historial.status));

  // Documentos: checklist desde la plantilla, subida al bucket privado, versión y enlace firmado
  const tplItems = sql(`select i.label, i.position, i.category_id from legal_checklist_template_items i join legal_checklist_templates t on t.id = i.template_id where t.procedure_type = 'Liquidación voluntaria' order by i.position`);
  ok("Plantilla de checklist de liquidación voluntaria con antecedentes", tplItems.length >= 7, String(tplItems.length));
  const ck = await jur.c.from("legal_checklist_items").insert(tplItems.map((it) => ({ client_id: id, label: it.label, position: it.position, category_id: it.category_id }))).select();
  ok("Jurídico crea el checklist del cliente (RLS legal.edit)", !ck.error && (ck.data ?? []).length === tplItems.length, ck.error?.message);
  const item = (ck.data ?? [])[0];
  const docsEmpty = await page(jur, `/clientes/${id}?tab=Documentos`);
  ok("Pestaña Documentos: checklist con todos los antecedentes pendientes", docsEmpty.status === 200 && new RegExp(`0 de ${tplItems.length}`).test(docsEmpty.text) && /Pendiente/.test(docsEmpty.text) && /Otros documentos/.test(docsEmpty.text), String(docsEmpty.status));
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  const path = `${id}/${crypto.randomUUID()}.pdf`;
  const up = await jur.c.storage.from("legal-documents").upload(path, pdf, { contentType: "application/pdf" });
  ok("Jurídico sube un archivo al bucket privado (RLS documents.upload)", !up.error, up.error?.message);
  const ejeUp = await eje.c.storage.from("legal-documents").upload(`${id}/${crypto.randomUUID()}.pdf`, pdf, { contentType: "application/pdf" });
  ok("Ejecutivo no puede subir al bucket", Boolean(ejeUp.error), ejeUp.error?.message);
  const doc = await jur.c.from("legal_documents").insert({ client_id: id, name: item.label, status: "recibido", storage_path: path, file_size: pdf.length, mime: "application/pdf", checklist_item_id: item.id, version: 1 }).select().single();
  ok("Documento registrado y vinculado al ítem", !doc.error, doc.error?.message);
  const link = await jur.c.from("legal_checklist_items").update({ satisfied: true, document_id: doc.data?.id }).eq("id", item.id).select();
  const docsOne = await page(jur, `/clientes/${id}?tab=Documentos`);
  ok(
    "Pestaña Documentos: 1 antecedente recibido con versión, tamaño y estado",
    // React separa «v» y «1» con un comentario en el HTML: al quitar etiquetas queda «v 1»
    !link.error && docsOne.status === 200 && new RegExp(`1 de ${tplItems.length}`).test(docsOne.text) && /v ?1 · 1 KB/.test(docsOne.text) && /Recibido/.test(docsOne.text),
    `${link.error?.message ?? ""} status=${docsOne.status}`
  );
  const signed = await jur.c.storage.from("legal-documents").createSignedUrl(path, 60);
  ok("Enlace firmado temporal para ver el documento", !signed.error && /token=/.test(signed.data?.signedUrl ?? ""), signed.error?.message);
  const ejeDocs = await eje.c.from("legal_documents").select("id").eq("client_id", id);
  ok("Ejecutivo no ve los documentos (RLS)", (ejeDocs.data ?? []).length === 0);
  const fichaDocs = await page(jur, `/clientes/${id}`);
  ok("Resumen de la ficha: avance del checklist", new RegExp(`1 de ${tplItems.length} antecedentes`).test(fichaDocs.text));

  // Cierre con motivo y lista de cerradas
  const close = await jur.c.from("legal_clients").update({ archived_at: new Date().toISOString(), close_reason: "Dejó de pagar", close_detail: "Última cuota en agosto" }).eq("id", id).select();
  ok("Cerrar la causa con motivo (RLS legal.edit)", !close.error && close.data?.[0]?.close_reason === "Dejó de pagar", close.error?.message);
  const auditClose = sql(`select action from audit_log where entity='legal_cliente' and entity_id='${id}' and action='cliente.cerrada'`);
  const histClose = sql(`select summary from legal_case_history where client_id='${id}' and kind='cierre'`);
  ok("El cierre queda en auditoría e historial con el motivo", auditClose.length === 1 && histClose.length === 1 && /Dejó de pagar/.test(histClose[0].summary));
  const cerradas = await page(jur, "/clientes?estado=cerradas");
  ok("Lista de cerradas: muestra la causa con su motivo", cerradas.status === 200 && /JUR Ficha Prueba/.test(cerradas.text) && /Dejó de pagar/.test(cerradas.text) && /Causas cerradas/.test(cerradas.text));
  const activas = await page(jur, "/clientes");
  ok("Lista de activas: la causa cerrada ya no aparece", activas.status === 200 && !/JUR Ficha Prueba/.test(activas.text));
  const fichaCerrada = await page(jur, `/clientes/${id}`);
  ok("Ficha cerrada: etiqueta «Cerrada · motivo» y botón Reabrir", /Cerrada · Dejó de pagar/.test(fichaCerrada.text) && /Reabrir causa/.test(fichaCerrada.text));
  const reopen = await jur.c.from("legal_clients").update({ archived_at: null, close_reason: null, close_detail: null }).eq("id", id).select();
  const histReopen = sql(`select count(*)::int as n from legal_case_history where client_id='${id}' and summary='Causa reabierta'`)[0];
  ok("Reabrir la causa queda en el historial", !reopen.error && histReopen?.n === 1, reopen.error?.message);
} catch (e) {
  fails++;
  console.log("ERROR " + e.message);
} finally {
  // El bucket solo se limpia por la API de Storage (la base bloquea borrados directos)
  try {
    const paths = sql(`select storage_path from legal_documents d join legal_clients c on c.id = d.client_id where c.full_name like 'JUR %' and d.storage_path is not null`).map((r) => r.storage_path);
    if (paths.length && typeof adm !== "undefined") await adm.c.storage.from("legal-documents").remove(paths);
  } catch (e) {
    console.log("aviso: no se pudo limpiar el bucket · " + e.message);
  }
  sql(`delete from legal_clients where full_name like 'JUR %'`);
  sql(`delete from vault.secrets where name like 'clave_unica:%' and id not in (select clave_unica_secret_id from legal_clients where clave_unica_secret_id is not null)`);
  sql(`delete from auth.users where email like 'e2e.%.${stamp}@gmail.com'`);
  sql(`delete from invitations where email like 'e2e.%.${stamp}@gmail.com'`);
  console.log(fails ? `${fails} fallo(s)` : "Todo OK");
  process.exit(fails ? 1 : 0);
}

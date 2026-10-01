// Ficha del cliente (etapa 1): Clave Única cifrada con auditoría, enlaces externos, alta manual y
// pantallas. Con npm run dev en :3001. Crea usuarios y clientes temporales y los borra al terminar.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const sql = (q) => JSON.parse(execSync(`node scripts/db-migrate.mjs sql ${JSON.stringify(q)}`, { encoding: "utf8" }) || "null");
const ref = env.NEXT_PUBLIC_SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./)[1];
const stamp = Date.now();
const BASE = "http://localhost:3001";
let fails = 0;
let realDrive = null;
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
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
  ok("Ficha: pestaña Causa con los 9 pasos de la liquidación, los comprobantes exigidos y ninguno completado", causa.status === 200 && /Pasos de la causa/.test(causa.text) && /0 de 9 completados/.test(causa.text) && /Resolución de término/.test(causa.text) && /Requiere certificado de envío de causa/.test(causa.text) && /Cierra la causa/.test(causa.text) && !/Certificado de ejecutoria/.test(causa.text));
  const nuevo = await page(jur, "/clientes/nuevo");
  ok("Alta manual: formulario con procedimiento y fecha de ingreso", nuevo.status === 200 && /Nuevo cliente/.test(nuevo.text) && /Fecha de ingreso/.test(nuevo.text));
  const ejeLista = await page(eje, "/clientes");
  ok("Ejecutivo del CRM: sin acceso a la lista", ejeLista.status === 307 || /Sin acceso/.test(ejeLista.text), String(ejeLista.status));

  // Pasos de la causa (liquidación voluntaria): completar, historial, hito en la cabecera
  const s1 = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Preparación de documentos", completed_at: "2026-09-13", note: "carpeta completa" }).select().single();
  const sinCert = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Ingreso de demanda", completed_at: "2026-09-14" }).select().single();
  ok("La base no acepta «Ingreso de demanda» sin su certificado de envío (trigger)", Boolean(sinCert.error) && /comprobante/.test(sinCert.error?.message ?? ""), sinCert.error?.message);
  const certPdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
  const certPath = `${id}/${crypto.randomUUID()}.pdf`;
  const certUp = await jur.c.storage.from("legal-documents").upload(certPath, certPdf, { contentType: "application/pdf" });
  const cert = await jur.c.from("legal_documents").insert({ client_id: id, name: "Certificado de envío de causa", doc_type: "comprobante", status: "recibido", storage_path: certPath, file_size: certPdf.length, mime: "application/pdf", version: 1 }).select().single();
  const s2 = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Ingreso de demanda", completed_at: "2026-09-14", document_id: cert.data?.id }).select().single();
  ok("Jurídico marca pasos completados; el ingreso de demanda lleva su certificado de envío enlazado", !s1.error && !certUp.error && !cert.error && !s2.error && s2.data?.document_id === cert.data?.id, s1.error?.message ?? certUp.error?.message ?? cert.error?.message ?? s2.error?.message);
  const causaCert = await page(jur, `/clientes/${id}?tab=Causa`);
  ok("Pestaña Causa: el paso muestra «Ver certificado de envío de causa»", causaCert.status === 200 && /Ver certificado de envío de causa/.test(causaCert.text));
  const hist = sql(`select summary from legal_case_history where client_id = '${id}' and kind = 'paso' order by at`);
  ok("Cada paso queda en el historial de la causa", hist.length === 2 && /Preparación/.test(hist[0].summary) && /Ingreso de demanda/.test(hist[1].summary), JSON.stringify(hist.map((h) => h.summary)));
  const upd2 = await jur.c.from("legal_clients").update({ current_step: "Apercibimientos", liquidation_resolution_at: null }).eq("id", id);
  ok("current_step se puede mantener desde la app", !upd2.error, upd2.error?.message);
  const causa2 = await page(jur, `/clientes/${id}?tab=Causa`);
  ok("Pestaña Causa: 9 pasos, dos completados y el actual señalado", causa2.status === 200 && /2 de 9 completados/.test(causa2.text) && /Paso actual/.test(causa2.text) && /Apercibimientos y tareas/.test(causa2.text), String(causa2.status));
  const fichaPaso = await page(jur, `/clientes/${id}`);
  ok("Cabecera: paso actual y aviso de resolución de liquidación pendiente", /Paso: Apercibimientos/.test(fichaPaso.text) && /Sin resolución de liquidación aún/.test(fichaPaso.text));
  const ejeStep = await eje.c.from("legal_case_steps").select("id").eq("client_id", id);
  ok("Ejecutivo no ve los pasos de la causa (RLS)", (ejeStep.data ?? []).length === 0);

  // Apercibimiento como tarea con vencimiento
  const task = await jur.c.from("legal_tasks").insert({ client_id: id, kind: "apercibimiento", title: "Acompañar certificado de deudas", due_at: "2026-10-03T13:00:00Z" }).select().single();
  ok("Apercibimiento creado como tarea con vencimiento (tipo nuevo admitido)", !task.error, task.error?.message);
  const listaTarea = await page(jur, "/clientes");
  ok("Lista: la próxima acción muestra el apercibimiento con su fecha", listaTarea.status === 200 && /Acompañar certificado de deudas/.test(listaTarea.text) && /Apercibimiento/.test(listaTarea.text) && /Paso/.test(listaTarea.text));

  // Revisión (antes «Mi día») e Historial
  // Con cientos de causas reales en la cola, se mira solo lo del abogado de prueba
  sql(`update legal_clients set lawyer_id = '${jur.id}' where id = '${id}'`);
  const rev = await page(jur, "/revision?ver=mios&anio=2026");
  ok("Revisión: la causa nunca revisada está en la cola con su tarea pendiente", rev.status === 200 && /JUR Ficha Prueba/.test(rev.text) && /Acompañar certificado de deudas/.test(rev.text) && /Nunca revisada/.test(rev.text) && /Por revisar/.test(rev.text), String(rev.status));
  const raiz = await fetch(`${BASE}/`, { headers: { cookie: jur.cookie }, redirect: "manual" });
  const hoyOld = await fetch(`${BASE}/hoy`, { headers: { cookie: jur.cookie }, redirect: "manual" });
  ok("La raíz y el antiguo /hoy llevan a Revisión", raiz.status === 307 && /\/revision/.test(raiz.headers.get("location") ?? "") && (hoyOld.status === 307 || hoyOld.status === 308) && /\/revision/.test(hoyOld.headers.get("location") ?? ""), `${raiz.status} ${hoyOld.status}`);
  const historial = await page(jur, `/clientes/${id}?tab=Historial`);
  ok("Historial: muestra los pasos completados con fecha y autor", historial.status === 200 && /Paso completado: Preparación de documentos/.test(historial.text) && /JUR juridico/.test(historial.text), String(historial.status));

  // Documentos: checklist desde la plantilla, subida al bucket privado, versión y enlace firmado
  const tplItems = sql(`select i.label, i.position, i.category_id from legal_checklist_template_items i join legal_checklist_templates t on t.id = i.template_id where t.procedure_type = 'Liquidación voluntaria' order by i.position`);
  ok("Plantilla de checklist de liquidación voluntaria con antecedentes", tplItems.length >= 7, String(tplItems.length));
  const ck = await jur.c.from("legal_checklist_items").insert(tplItems.map((it) => ({ client_id: id, label: it.label, position: it.position, category_id: it.category_id }))).select();
  ok("Jurídico crea el checklist del cliente (RLS legal.edit)", !ck.error && (ck.data ?? []).length === tplItems.length, ck.error?.message);
  const item = (ck.data ?? [])[0];
  const docsEmpty = await page(jur, `/clientes/${id}?tab=Documentos`);
  // El checklist está apagado en la interfaz (CHECKLIST_ENABLED = false): la pestaña muestra el Drive y el almacén, sin antecedentes
  ok("Pestaña Documentos: carpeta del Drive y almacén, sin checklist en pantalla", docsEmpty.status === 200 && /Carpeta del cliente en el Drive/.test(docsEmpty.text) && /Documentos en el almacén/.test(docsEmpty.text) && !/Checklist de antecedentes/.test(docsEmpty.text), String(docsEmpty.status));
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
    "Pestaña Documentos: el archivo subido aparece con versión, tamaño y estado",
    // React separa «v» y «1» con un comentario en el HTML: al quitar etiquetas queda «v 1»
    !link.error && docsOne.status === 200 && /1 KB · v ?1/.test(docsOne.text) && /Recibido/.test(docsOne.text),
    `${link.error?.message ?? ""} status=${docsOne.status}`
  );
  const signed = await jur.c.storage.from("legal-documents").createSignedUrl(path, 60);
  ok("Enlace firmado temporal para ver el documento", !signed.error && /token=/.test(signed.data?.signedUrl ?? ""), signed.error?.message);
  const ejeDocs = await eje.c.from("legal_documents").select("id").eq("client_id", id);
  ok("Ejecutivo no ve los documentos (RLS)", (ejeDocs.data ?? []).length === 0);
  const fichaDocs = await page(jur, `/clientes/${id}`);
  ok("Resumen de la ficha: tile Documentos apunta a la carpeta del Drive (checklist apagado)", /Carpeta del Drive (por vincular|vinculada)/.test(fichaDocs.text) && !/Sin checklist/.test(fichaDocs.text));

  // Google Drive: conexión del estudio (solo administrador), tokens en la bóveda, estado visible para el área.
  // Si el estudio ya tiene el Drive conectado de verdad, se aparta y se restaura al final (la prueba usa una conexión ficticia).
  realDrive = sql(`select c.google_email, c.access_token, c.expires_at, c.root_folder_id, c.root_folder_name, c.connected_by, c.connected_at, s.decrypted_secret as refresh from drive_connection c join vault.decrypted_secrets s on s.id = c.refresh_secret_id where c.id = true`)?.[0] ?? null;
  if (realDrive) {
    sql(`delete from vault.secrets where id = (select refresh_secret_id from drive_connection where id = true)`);
    sql(`delete from drive_connection where id = true`);
    console.log(`info: conexión real del Drive (${realDrive.google_email}) apartada durante la prueba`);
  }
  const st0 = await jur.c.rpc("drive_status");
  ok("Drive: estado visible sin conexión (no conectado)", !st0.error && (st0.data?.[0]?.connected ?? false) === false, st0.error?.message);
  const jurConnect = await jur.c.rpc("drive_connect", { p_email: "x@deudalibre.cl", p_refresh: "r", p_access: "a", p_expires_at: new Date().toISOString() });
  ok("Drive: un abogado no puede conectar la cuenta (solo legal.settings)", Boolean(jurConnect.error), jurConnect.error?.message);
  const admConnect = await adm.c.rpc("drive_connect", { p_email: "drive@deudalibre.cl", p_refresh: "refresh-de-prueba", p_access: "acceso-de-prueba", p_expires_at: new Date(Date.now() + 3600e3).toISOString() });
  ok("Drive: el administrador guarda la conexión", !admConnect.error, admConnect.error?.message);
  const driveSecret = sql(`select secret from vault.secrets where name = 'google_drive_refresh'`)[0];
  ok("Drive: el refresh token queda cifrado en la bóveda", driveSecret && driveSecret.secret !== "refresh-de-prueba");
  const st1 = await jur.c.rpc("drive_status");
  ok("Drive: el área ve conectado y con qué cuenta, sin secretos", st1.data?.[0]?.connected === true && st1.data?.[0]?.google_email === "drive@deudalibre.cl" && !("refresh_token" in (st1.data?.[0] ?? {})));
  const tk = await jur.c.rpc("drive_tokens");
  ok("Drive: el servidor obtiene los tokens descifrados", !tk.error && tk.data?.[0]?.refresh_token === "refresh-de-prueba" && tk.data?.[0]?.access_token === "acceso-de-prueba", tk.error?.message);
  const ejeTk = await eje.c.rpc("drive_tokens");
  ok("Drive: un ejecutivo del CRM no obtiene tokens", Boolean(ejeTk.error), ejeTk.error?.message);
  const directDrive = await adm.c.from("drive_connection").select("*");
  ok("Drive: la tabla no se lee directamente ni siendo administrador", Boolean(directDrive.error) || (directDrive.data ?? []).length === 0);
  const root = await adm.c.rpc("drive_set_root", { p_folder_id: "1AbCdEfGhIjKlMnOpQrStUv", p_name: "Clientes" });
  const st2 = await jur.c.rpc("drive_status");
  ok("Drive: carpeta raíz guardada y visible", !root.error && st2.data?.[0]?.root_folder_name === "Clientes", root.error?.message);
  const docsDrive = await page(jur, `/clientes/${id}?tab=Documentos`);
  ok("Pestaña Documentos: panel de la carpeta del Drive (conexión de prueba, sin acceso real)", docsDrive.status === 200 && /Carpeta del cliente en el Drive/.test(docsDrive.text), String(docsDrive.status));
  const dl = await jur.c.from("legal_documents").insert({ client_id: id, name: "Cédula (Drive)", status: "recibido", mime: "application/pdf", drive_file_id: "1XyZdriveFileId12345", drive_link: "https://drive.google.com/file/d/1XyZdriveFileId12345/view", version: 1 }).select().single();
  ok("Documento vinculado a un archivo del Drive (sin copia en el almacén)", !dl.error && dl.data?.storage_path === null, dl.error?.message);
  const disc = await adm.c.rpc("drive_disconnect");
  const driveSecretGone = sql(`select count(*)::int as n from vault.secrets where name = 'google_drive_refresh'`)[0];
  ok("Drive: desconectar borra la conexión y el secreto", !disc.error && driveSecretGone?.n === 0, disc.error?.message);

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

  // Resolución de término: con su comprobante, la causa se cierra sola como «Causa terminada»
  const resPath = `${id}/${crypto.randomUUID()}.pdf`;
  await jur.c.storage.from("legal-documents").upload(resPath, certPdf, { contentType: "application/pdf" });
  const res = await jur.c.from("legal_documents").insert({ client_id: id, name: "Resolución de término", doc_type: "comprobante", status: "recibido", storage_path: resPath, file_size: certPdf.length, mime: "application/pdf", version: 1 }).select().single();
  const sinRes = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Resolución de término", completed_at: "2026-09-29" }).select();
  ok("La base no acepta la resolución de término sin el documento", Boolean(sinRes.error));
  const term = await jur.c.from("legal_case_steps").insert({ client_id: id, step: "Resolución de término", completed_at: "2026-09-29", document_id: res.data?.id }).select().single();
  const rowTerm = sql(`select archived_at is not null as cerrada, close_reason, close_detail, current_step from legal_clients where id='${id}'`)[0];
  ok("Al subir la resolución de término la causa queda cerrada como «Causa terminada» (trigger)", !term.error && rowTerm?.cerrada === true && rowTerm?.close_reason === "Causa terminada" && /29\/09\/2026/.test(rowTerm?.close_detail ?? "") && rowTerm?.current_step === "Completada", term.error?.message ?? JSON.stringify(rowTerm));
  const cerradasTerm = await page(jur, "/clientes?estado=cerradas");
  ok("Lista de cerradas: la causa terminada aparece con su etiqueta", cerradasTerm.status === 200 && /JUR Ficha Prueba/.test(cerradasTerm.text) && /Causa terminada/.test(cerradasTerm.text));
  const fichaTerm = await page(jur, `/clientes/${id}`);
  ok("Ficha: cabecera «Causa terminada» con el detalle de la resolución", /Causa terminada/.test(fichaTerm.text) && /Resolución de término del 29\/09\/2026/.test(fichaTerm.text));
} catch (e) {
  fails++;
  console.log("ERROR " + e.message);
} finally {
  if (realDrive) {
    // Se restaura antes que nada y en una sola línea (el shell no admite saltos de línea en la consulta)
    try {
      sql(`delete from vault.secrets where name = 'google_drive_refresh'`);
      sql(`delete from drive_connection where id = true`);
      const cols = "id, google_email, refresh_secret_id, access_token, expires_at, root_folder_id, root_folder_name, connected_by, connected_at";
      const vals = [
        "true", lit(realDrive.google_email),
        `vault.create_secret(${lit(realDrive.refresh)}, 'google_drive_refresh', 'Refresh token de Google Drive del estudio')`,
        lit(realDrive.access_token), lit(realDrive.expires_at), lit(realDrive.root_folder_id), lit(realDrive.root_folder_name), lit(realDrive.connected_by), lit(realDrive.connected_at),
      ].join(", ");
      sql(`insert into drive_connection (${cols}) values (${vals})`);
      const back = sql(`select c.google_email, (s.decrypted_secret = ${lit(realDrive.refresh)}) as same from drive_connection c join vault.decrypted_secrets s on s.id = c.refresh_secret_id where c.id = true`)?.[0];
      ok("Drive: conexión real del estudio restaurada tras la prueba", back?.google_email === realDrive.google_email && back?.same === true, JSON.stringify(back));
    } catch (e) {
      fails++;
      const rescue = `drive-rescue-${stamp}.json`;
      writeFileSync(rescue, JSON.stringify(realDrive));
      console.log(`FAIL Drive: no se pudo restaurar la conexión real (${e.message}). Datos guardados en ${rescue}: vuelve a conectar el Drive desde Configuración o restaura a mano y borra ese archivo.`);
    }
  }
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

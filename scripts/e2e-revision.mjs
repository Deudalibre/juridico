// Revisión de causas: registro de revisiones (RLS, trigger que actualiza la causa, historial, auditoría y
// notificaciones), cola ordenada, historial y marco de la app. Con npm run dev en :3001. Todo temporal y se borra.
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
  const jur = await user("juridico", "juridico"); // revisa
  const abo = await user("abogado", "juridico"); // abogado a cargo: recibe el aviso
  const eje = await user("ejecutivo", "ejecutivo");

  const a = await jur.c.from("legal_clients").insert({ full_name: "JUR Revisión Antigua", procedure_type: "Liquidación voluntaria", rol: "C-1-2026", intake_date: "2026-03-01", lawyer_id: abo.id }).select().single();
  const b = await jur.c.from("legal_clients").insert({ full_name: "JUR Revisión Nueva", procedure_type: "Renegociación", rol: "R-2-2026", intake_date: "2026-09-01", lawyer_id: abo.id }).select().single();
  const p = await jur.c.from("legal_clients").insert({ full_name: "JUR Revisión Preparación", procedure_type: "Liquidación voluntaria", lawyer_id: abo.id }).select().single();
  ok("Dos causas de prueba con abogado a cargo y un cliente en preparación (sin rol ni fecha)", !a.error && !b.error && !p.error, a.error?.message ?? b.error?.message ?? p.error?.message);
  const idA = a.data.id;
  const idB = b.data.id;

  // 1. Marco de la app y cola
  const portada = await page(jur, `/revision?ver=${abo.id}`);
  ok("Portada de Revisión: causas por año, meses, «Mostrar todo el año» y botón Revisar", portada.status === 200 && /2026/.test(portada.text) && /Mostrar todo el año/.test(portada.text) && /Revisar/.test(portada.text) && !/JUR Revisión Antigua/.test(portada.text), String(portada.status));
  const prepPos = portada.text.indexOf("En preparación");
  ok("Portada: el cliente sin rol va aparte en «En preparación», con «Ingresar demanda» y sin «Sin movimiento»", prepPos > 0 && portada.text.indexOf("JUR Revisión Preparación") > prepPos && /Ingresar demanda/.test(portada.text.slice(prepPos)) && !/Sin movimiento/.test(portada.text.slice(prepPos)), String(prepPos));
  const rev = await page(jur, `/revision?ver=${abo.id}&anio=2026`);
  // Desde 0033 (2026-10-05) el abogado tramitador (rol juridico) solo ve Revisión y Clientes: Plantillas y Documentos son del administrador
  ok("Marco: barra lateral con Revisión, Clientes y CRM (sin Plantillas ni Documentos para el rol juridico); migas «Revisión › Por revisar»", rev.status === 200 && /Revisión/.test(rev.text) && /Clientes/.test(rev.text) && !/Plantillas/.test(rev.text) && /CRM/.test(rev.text) && /Por revisar/.test(rev.text), String(rev.status));
  ok("Marco: submenú de la sección (Historial de revisiones) y campana de notificaciones", /Historial de revisiones/.test(rev.text) && /aria-label="Notificaciones/.test(rev.html));
  const posA = rev.text.indexOf("JUR Revisión Antigua");
  const posB = rev.text.indexOf("JUR Revisión Nueva");
  ok("Cola: agrupada por año y mes de ingreso; marzo antes que septiembre", posA > 0 && posB > 0 && posA < posB && /2026/.test(rev.text) && rev.text.indexOf("Marzo") < posA && rev.text.indexOf("Septiembre") > posA && rev.text.indexOf("Septiembre") < posB, `${posA} ${posB}`);
  const anio26 = await page(jur, `/revision?anio=2026&ver=${abo.id}`);
  const anio24 = await page(jur, `/revision?anio=2024&ver=${abo.id}`);
  ok("Filtro de año: 2026 muestra ambas causas y 2024 ninguna", anio26.status === 200 && /JUR Revisión Antigua/.test(anio26.text) && /JUR Revisión Nueva/.test(anio26.text) && anio24.status === 200 && !/JUR Revisión/.test(anio24.text));
  ok("Cola: cada fila dice «Nunca revisada» y muestra al abogado a cargo", (rev.text.match(/Nunca revisada/g) ?? []).length >= 2 && /JUR abogado/.test(rev.text));
  const badge = rev.html.match(/class="rail-badge"[^>]*>(\d+)/)?.[1];
  ok("Insignia en «Revisión» con las causas por revisar", Number(badge) >= 2, String(badge));

  // 2. Registrar una revisión con tarea pendiente (como haría el diálogo): tarea + revisión
  const task = await jur.c.from("legal_tasks").insert({ client_id: idA, kind: "solicitar_documento", title: "Pedir liquidaciones de sueldo", due_at: new Date(Date.now() + 3600_000).toISOString(), assignee_id: abo.id }).select().single();
  ok("Tarea pendiente creada y asignada al abogado", !task.error, task.error?.message);
  const notifTask = sql(`select title, body, client_id from notifications where user_id = '${abo.id}' and client_id = '${idA}' order by created_at`);
  ok("Notificación al responsable por la tarea asignada (trigger)", notifTask.length === 1 && /Tarea asignada/.test(notifTask[0].title) && /Pedir liquidaciones/.test(notifTask[0].body), JSON.stringify(notifTask));
  const next = new Date(Date.now() + 7 * 86400_000).toISOString();
  const r1 = await jur.c.from("legal_reviews").insert({ client_id: idA, reviewed_by: jur.id, had_movement: true, note: "El tribunal pidió liquidaciones actualizadas", next_review_at: next, task_id: task.data.id }).select().single();
  ok("Jurídico registra la revisión (RLS legal.edit)", !r1.error, r1.error?.message);
  const rowA = sql(`select last_review_at, next_review_at from legal_clients where id = '${idA}'`)[0];
  ok("Trigger: la causa guarda última y próxima revisión", rowA?.last_review_at && rowA?.next_review_at && new Date(rowA.next_review_at) > new Date(), JSON.stringify(rowA));
  const rvRow = sql(`select reviewer_name from legal_reviews where id = '${r1.data.id}'`)[0];
  ok("Trigger: nombre del revisor guardado", rvRow?.reviewer_name === "JUR juridico", JSON.stringify(rvRow));
  const hist = sql(`select summary, actor_name from legal_case_history where client_id = '${idA}' and kind = 'revision'`);
  ok("Historial de la causa: «Revisión: con movimiento · nota · tarea»", hist.length === 1 && /con movimiento/.test(hist[0].summary) && /liquidaciones actualizadas/.test(hist[0].summary) && /tarea: Pedir/.test(hist[0].summary) && hist[0].actor_name === "JUR juridico", JSON.stringify(hist));
  const audit = sql(`select action from audit_log where entity = 'legal_cliente' and entity_id = '${idA}' and action = 'causa.revisada'`);
  ok("Auditoría: causa.revisada", audit.length === 1);
  const notifRev = sql(`select title from notifications where user_id = '${abo.id}' and client_id = '${idA}' and title like 'Tarea pendiente en%'`);
  ok("Notificación al abogado a cargo: la causa quedó con tarea pendiente tras la revisión de otro", notifRev.length === 1, JSON.stringify(notifRev));
  const own = await abo.c.from("notifications").select("id, client_id, read_at").eq("client_id", idA);
  const other = await jur.c.from("notifications").select("id").eq("client_id", idA);
  ok("El abogado ve sus notificaciones (RLS) y el revisor no ve las del abogado", (own.data ?? []).length === 2 && (other.data ?? []).length === 0);
  const read = await abo.c.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", own.data[0].id).select();
  ok("El abogado marca una notificación como leída", !read.error && read.data?.[0]?.read_at, read.error?.message);

  // 3. Permisos
  const ejeRev = await eje.c.from("legal_reviews").insert({ client_id: idB, reviewed_by: eje.id, had_movement: false }).select();
  ok("Un ejecutivo del CRM no registra revisiones", Boolean(ejeRev.error) || (ejeRev.data ?? []).length === 0, ejeRev.error?.message);
  const fake = await jur.c.from("legal_reviews").insert({ client_id: idB, reviewed_by: abo.id, had_movement: false }).select();
  ok("Nadie registra una revisión a nombre de otro", Boolean(fake.error), fake.error?.message);
  const ejeSee = await eje.c.from("legal_reviews").select("id").eq("client_id", idA);
  ok("Un ejecutivo no ve las revisiones", !ejeSee.error && (ejeSee.data ?? []).length === 0);

  // 4. Pantallas después de la revisión
  const rev2 = await page(jur, `/revision?ver=${abo.id}&anio=2026`);
  // Una sola tabla, sin franjas de grupo: el estado se lee en la fila de cada causa
  const posA2 = rev2.text.indexOf("JUR Revisión Antigua");
  const filaA = rev2.text.slice(posA2, posA2 + 400);
  ok("Revisión: la causa revisada muestra movimiento, fecha y revisor en su fila", rev2.status === 200 && posA2 > 0 && /con mov/i.test(filaA) && /JUR juridico/.test(rev2.text), filaA.slice(0, 160));
  const posN2 = rev2.text.indexOf("JUR Revisión Nueva");
  ok("Revisión: la causa nueva sigue sin revisar (Nunca revisada)", posN2 > 0 && /Nunca revisada/.test(rev2.text.slice(posN2, posN2 + 400)));
  const mios = await page(abo, "/revision?ver=mios&anio=2026&mes=9");
  ok("Año y mes concretos (septiembre 2026) con «Mis causas»: solo la causa de ese mes", mios.status === 200 && /JUR Revisión Nueva/.test(mios.text) && !/JUR Revisión Antigua/.test(mios.text) && /Todo el año/.test(mios.text));
  const proc = await page(jur, `/revision?proc=Renegociaci%C3%B3n&ver=${abo.id}&anio=2026`);
  ok("Filtro por procedimiento", proc.status === 200 && /JUR Revisión Nueva/.test(proc.text) && !/JUR Revisión Antigua/.test(proc.text));
  const histPage = await page(jur, "/revision/historial");
  ok("Historial de revisiones: fila con causa, movimiento, nota, tarea y revisor", histPage.status === 200 && /JUR Revisión Antigua/.test(histPage.text) && /Con movimiento/.test(histPage.text) && /liquidaciones actualizadas/.test(histPage.text) && /Tarea: Pedir/.test(histPage.text) && /JUR juridico/.test(histPage.text), String(histPage.status));
  const lista = await page(jur, "/clientes");
  // Desde el 2026-10-06 la lista es solo antecedentes (nombre, procedimiento, rol, tribunal, abogado): sin estado, próxima acción ni revisada
  ok("Lista de causas: solo antecedentes, sin columnas de Estado, Próxima acción ni Revisada", lista.status === 200 && /JUR Revisión Antigua/.test(lista.text) && /Tribunal/.test(lista.text) && !/Próxima acción/.test(lista.text) && !/Revisada/.test(lista.text));
  const ficha = await page(jur, `/clientes/${idA}`);
  ok("Ficha: tile «Última revisión» con movimiento, fecha, revisor y próxima", ficha.status === 200 && /Última revisión/.test(ficha.text) && /Con movimiento/.test(ficha.text) && /Próxima:/.test(ficha.text));
  const fichaHist = await page(jur, `/clientes/${idA}?tab=Historial`);
  ok("Ficha › Historial: la revisión aparece como «Revisión»", /Revisión: con movimiento/.test(fichaHist.text));
  // 4b. Cierre de tareas con resultado y cadencia automática (PR #19)
  const cad3 = await jur.c.rpc("legal_review_cadence_days", { p_client: idA });
  ok("Cadencia: sin resolución de liquidación la causa se revisa cada 3 días", !cad3.error && cad3.data === 3, cad3.error?.message ?? String(cad3.data));
  const closeTask = await jur.c.from("legal_tasks").update({ status: "completada", result: "Documento recibido", closed_by: jur.id, completed_at: new Date().toISOString() }).eq("id", task.data.id).select().single();
  ok("Cerrar una tarea guarda resultado y quién la cerró (closed_by)", !closeTask.error && closeTask.data?.closed_by === jur.id && closeTask.data?.result === "Documento recibido", closeTask.error?.message);
  const histTask = sql(`select summary, actor_name from legal_case_history where client_id = '${idA}' and kind = 'tarea' order by at`);
  ok("Historial de la causa: tarea creada y tarea completada con su resultado (trigger 0018)", histTask.some((h) => /^Tarea creada: Pedir/.test(h.summary)) && histTask.some((h) => /^Tarea completada: Pedir.*Documento recibido/.test(h.summary) && h.actor_name === "JUR juridico"), JSON.stringify(histTask));
  const auditTask = sql(`select action from audit_log where entity='legal_cliente' and entity_id='${idA}' and action='causa.tarea.completada'`);
  ok("Auditoría: causa.tarea.completada", auditTask.length === 1);
  const tareas = await page(jur, "/revision/tareas");
  ok("Revisión › Tareas cerradas: fila con causa, resultado y quién cerró, filtros y exportación", tareas.status === 200 && /JUR Revisión Antigua/.test(tareas.text) && /Documento recibido/.test(tareas.text) && /JUR juridico/.test(tareas.text) && /Exportar/.test(tareas.text), String(tareas.status));
  const stepRes = await jur.c.from("legal_case_steps").insert({ client_id: idA, step: "Resolución de liquidación", completed_at: "2026-09-20" }).select();
  const cad7 = await jur.c.rpc("legal_review_cadence_days", { p_client: idA });
  ok("Cadencia: con resolución de liquidación pasa a 7 días", !stepRes.error && cad7.data === 7, stepRes.error?.message ?? String(cad7.data));
  const rev3 = await page(jur, `/revision?ver=${abo.id}&anio=2026`);
  // Desde el 2026-10-06 la fila lleva un solo botón, «Revisar» (el «Sin movimiento» directo se quitó a petición del estudio)
  ok("Revisión: botón «Revisar» (sin «Sin movimiento» directo) y acceso a Tareas cerradas", rev3.status === 200 && /Revisar/.test(rev3.text) && !/>s*Sin movimientos*</.test(rev3.html ?? "") && /Tareas cerradas/.test(rev3.text));

  // 5. Paridad con el CRM: calendario, filtros y exportación
  const cal = await page(jur, `/revision?modo=calendario&ver=${abo.id}`);
  ok("Revisión › Calendario: semana con la tarea pendiente en su día", cal.status === 200 && /Semana del/.test(cal.text) && /Pedir liquidaciones de sueldo/.test(cal.text) && /JUR Revisión Antigua/.test(cal.text), String(cal.status));
  const filtered = await page(jur, `/clientes?abogado=${abo.id}&proc=Renegociaci%C3%B3n`);
  ok("Lista de causas: filtros por abogado y procedimiento, botón Filtros con contador y Exportar", filtered.status === 200 && /JUR Revisión Nueva/.test(filtered.text) && !/JUR Revisión Antigua/.test(filtered.text) && /Filtros\s*2/.test(filtered.text) && /Exportar/.test(filtered.text));
  const filteredStep = await page(jur, `/clientes?paso=Preparaci%C3%B3n%20de%20documentos`);
  ok("Lista de causas: filtro por paso actual", filteredStep.status === 200 && /JUR Revisión Antigua/.test(filteredStep.text) && /JUR Revisión Nueva/.test(filteredStep.text));
  ok("Historial de revisiones: botón Exportar", /Exportar/.test(histPage.text));
  ok("Marco: sin Tablero (quitado a petición del estudio) y menú de usuario (Radix, se abre al pulsar)", !/Tablero/.test(rev.text) && /aria-label="Menú de usuario"/.test(rev.html));
  const ejePage = await page(eje, "/revision");
  ok("Un ejecutivo no entra a Revisión", ejePage.status === 307 || /Sin acceso/.test(ejePage.text), String(ejePage.status));
} catch (e) {
  fails++;
  console.log("ERROR " + e.message);
} finally {
  sql(`delete from legal_clients where full_name like 'JUR %'`);
  sql(`delete from auth.users where email like 'e2e.%.${stamp}@gmail.com'`);
  sql(`delete from invitations where email like 'e2e.%.${stamp}@gmail.com'`);
  console.log(fails ? `${fails} fallo(s)` : "Todo OK");
  process.exit(fails ? 1 : 0);
}

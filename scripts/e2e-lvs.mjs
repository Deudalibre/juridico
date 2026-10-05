// Etapa 1 de la LVS: Ficha Maestra. Prueba contra Supabase y el servidor de desarrollo (npm run dev en :3001).
// Crea un usuario jurídico y un ejecutivo temporales, un cliente con expediente LVS, guarda la ficha y comprueba
// RLS, historial, avance y pantallas. Todo temporal y se borra al final. Uso: node scripts/e2e-lvs.mjs
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
  const r = await c.auth.signUp({ email, password: "Prueba-12345!", options: { data: { full_name: `LVS ${name}` } } });
  if (r.error) throw new Error(r.error.message);
  return { c, id: r.data.user.id, cookie: `sb-${ref}-auth-token=base64-${Buffer.from(JSON.stringify(r.data.session)).toString("base64url")}` };
}
const page = async (u, p) => {
  const res = await fetch(BASE + p, { headers: { cookie: u.cookie }, redirect: "manual" });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, html, text: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") };
};

try {
  const jur = await user("juridico", "administrador"); // LVS es del administrador desde 0033 (el rol juridico ya no tiene documents.*)
  const eje = await user("ejecutivo", "ejecutivo");

  // Cliente + expediente (como lo hace «Nueva solicitud LVS»)
  const cl = await jur.c.from("legal_clients").insert({ full_name: "LVS Cliente Prueba", rut: "111111111", procedure_type: "Liquidación voluntaria" }).select().single();
  ok("Jurídico crea el cliente", !cl.error, cl.error?.message);
  const id = cl.data?.id;
  const lvs = await jur.c.from("legal_lvs").insert({ client_id: id }).select().single();
  ok("Jurídico abre el expediente LVS (RLS legal.create)", !lvs.error && lvs.data?.estado === "borrador", lvs.error?.message);
  const dup = await jur.c.from("legal_lvs").insert({ client_id: id });
  ok("Un cliente no puede tener dos expedientes", Boolean(dup.error));

  // RLS: el ejecutivo del CRM no ve ni escribe
  const seen = await eje.c.from("legal_lvs").select("client_id");
  ok("Ejecutivo · no ve expedientes LVS", (seen.data ?? []).length === 0);
  const write = await eje.c.from("legal_lvs").update({ comuna: "X" }).eq("client_id", id).select();
  ok("Ejecutivo · no edita expedientes LVS", (write.data ?? []).length === 0);

  // Pantallas
  const lista = await page(jur, "/documentos/lvs");
  ok("/documentos/lvs lista el expediente con su avance", lista.status === 200 && lista.html.includes("LVS Cliente Prueba") && /Borrador/.test(lista.text), String(lista.status));
  const nueva = await page(jur, "/documentos/lvs/nueva?q=LVS%20Cliente");
  ok("/documentos/lvs/nueva encuentra al cliente y avisa que ya tiene expediente", nueva.status === 200 && /Ya tiene expediente/.test(nueva.text), String(nueva.status));
  const exp = await page(jur, `/documentos/lvs/${id}?tab=Ficha%20maestra`);
  ok("Expediente · una sola página con índice y todos los bloques", exp.status === 200 && /Cliente.*Tribunal.*Trabajo.*Patrimonio.*Juicios.*Acreedores.*Carta.*Documentación.*Generados.*Historial/.test(exp.text) && /Patrimonio · art. 273 A/.test(exp.text) && /Lo que lleva la carpeta/.test(exp.text) && /Documentos generados/.test(exp.text), String(exp.status));
  ok("Expediente · avance inicial parcial (nombre y RUT ya cuentan)", /Ficha\s*11%/.test(exp.text));
  const ejeExp = await page(eje, `/documentos/lvs/${id}`);
  ok("Ejecutivo · el expediente no se le muestra", ejeExp.status !== 200 || /Sin acceso/.test(ejeExp.text), String(ejeExp.status));

  // Guardado completo (mismos campos que el formulario) y estado automático
  const full = {
    genero: "F", estado_civil: "Soltero/a", profesion_oficio: "Vendedora", domicilio: "Calle 1 n° 2", comuna: "Maipú", region: "Metropolitana",
    relacion_laboral: true, empleador: "Empresa SpA", rut_empleador: "761234560",
    comuna_tribunal: "Santiago", sj_comuna: "S.J.L. Civil de Santiago", carta_original: "Texto del cliente", carta_demanda: "Texto para la demanda",
    tiene_bienes_raices: false, tiene_vehiculos: true, tiene_aguas: false, tiene_participaciones: false, tiene_instrumentos: false, tiene_bienes_muebles: true, tiene_juicios: false,
  };
  const upd = await jur.c.from("legal_lvs").update(full).eq("client_id", id).select().single();
  ok("Jurídico guarda la ficha completa (RLS legal.edit)", !upd.error && upd.data?.tiene_vehiculos === true, upd.error?.message);
  const after = await page(jur, `/documentos/lvs/${id}?tab=Resumen`);
  ok("Cabecera · la ficha marca 100% y el patrimonio está en la página", after.status === 200 && /Ficha\s*100%/.test(after.text) && /Patrimonio · art\. 273 A/.test(after.text), String(after.status));

  // Bienes y juicios (etapa 3): se cargan desde la ficha; la base valida los códigos oficiales
  const veh = await jur.c.from("legal_lvs_vehiculos").insert({ client_id: id, tipo_codigo: 1, patente: "ABCD12", marca: "Toyota", modelo: "Yaris", anio: 2018, avaluo_fiscal: 5000000 }).select().single();
  ok("Bienes · jurídico agrega un vehículo (RLS)", !veh.error && veh.data?.tipo_codigo === 1, veh.error?.message);
  const mueble = await jur.c.from("legal_lvs_bienes_muebles").insert({ client_id: id, tipo_codigo: 16, datos: "Cuenta de ahorro Banco Estado", monto: 120000 }).select().single();
  ok("Bienes · bien mueble con código del Anexo 8", !mueble.error && mueble.data?.tipo_codigo === 16, mueble.error?.message);
  const bad = await jur.c.from("legal_lvs_vehiculos").insert({ client_id: id, tipo_codigo: 99 });
  ok("Bienes · la base rechaza un código fuera del Anexo 4", Boolean(bad.error));
  const eVeh = await eje.c.from("legal_lvs_vehiculos").select("id");
  ok("Ejecutivo · no ve los bienes LVS", (eVeh.data ?? []).length === 0);
  const bienesPage = await page(jur, `/documentos/lvs/${id}?tab=Ficha%20maestra`);
  ok("Ficha · las listas de vehículos y bienes muebles se despliegan bajo su «Sí»", bienesPage.status === 200 && /Toyota Yaris 2018/.test(bienesPage.text) && /Cuenta de ahorro Banco Estado/.test(bienesPage.text) && /Anexo N.º 4/.test(bienesPage.text), String(bienesPage.status));
  const jui = await jur.c.from("legal_lvs_juicios").insert({ client_id: id, rol: "C-55-2025", tribunal: "2º Juzgado Civil de Santiago", calidad: "Demandado", monto: 1500000 }).select().single();
  ok("Juicios · se cargan desde la ficha (RLS) con calidad validada", !jui.error && jui.data?.calidad === "Demandado", jui.error?.message);
  const juiBad = await jur.c.from("legal_lvs_juicios").insert({ client_id: id, calidad: "Otro" });
  ok("Juicios · la base rechaza una calidad fuera de la norma", Boolean(juiBad.error));
  const hBien = sql(`select summary from legal_case_history where client_id = '${id}' and summary like 'Vehículo%' limit 1`);
  ok("Historial · alta del vehículo registrada", /Vehículo agregado/.test(hBien[0]?.summary ?? ""));

  // Acreedores (Anexo 9): catálogo importado y deudas del expediente
  const cat = await jur.c.from("legal_acreedores").select("id, nombre, rut, email").ilike("nombre", "%falabella%");
  ok("Acreedores · el catálogo trae los Falabella con RUT y correo", (cat.data ?? []).length >= 3 && cat.data.every((a) => a.rut && a.email), String((cat.data ?? []).length));
  const fal = (cat.data ?? []).find((a) => /Promotora CMR/i.test(a.nombre));
  const deuda = await jur.c.from("legal_lvs_deudas").insert({ client_id: id, acreedor_id: fal?.id, nombre: fal?.nombre, rut: fal?.rut, email: fal?.email, monto: 2500000, naturaleza: "Valista" }).select().single();
  ok("Acreedores · deuda enlazada al catálogo (RLS legal.edit)", !deuda.error && deuda.data?.naturaleza === "Valista", deuda.error?.message);
  const deudaBad = await jur.c.from("legal_lvs_deudas").insert({ client_id: id, nombre: "X", naturaleza: "Otra" });
  ok("Acreedores · la base rechaza una naturaleza fuera de la norma", Boolean(deudaBad.error));
  const eDeu = await eje.c.from("legal_acreedores").select("id").limit(1);
  ok("Ejecutivo · no ve el catálogo de acreedores", (eDeu.data ?? []).length === 0);
  const fichaDeudas = await page(jur, `/documentos/lvs/${id}?tab=Ficha%20maestra`);
  ok("Ficha · sección Acreedores con la deuda y el total", fichaDeudas.status === 200 && /Acreedores · Anexo N\.º 9/.test(fichaDeudas.text) && /Promotora CMR/.test(fichaDeudas.text) && /2\.500\.000/.test(fichaDeudas.text), String(fichaDeudas.status));

  // Documentación: lista recordatorio desde la ficha (sin marcar nada)
  const docsPage = await page(jur, `/documentos/lvs/${id}?tab=Documentación`);
  ok("Documentación · lista con los fijos, contrato y liquidaciones (trabaja), no matrimonio (soltera), Anexo 4 y CAV del vehículo", docsPage.status === 200 && /Lo que lleva la carpeta/.test(docsPage.text) && /Carnet de identidad/.test(docsPage.text) && /Contrato de trabajo/.test(docsPage.text) && /no matrimonio/.test(docsPage.text) && /Anexo N\.º 4/.test(docsPage.text) && /anotaciones vigentes · ABCD12/.test(docsPage.text), String(docsPage.status));
  const soloDocs = docsPage.text.slice(docsPage.text.indexOf("Lo que lleva la carpeta"), docsPage.text.indexOf("Documentos generados"));
  ok("Documentación · sin Anexo 3 ni dominio vigente (no tiene bienes raíces)", !/Anexo N\.º 3/.test(soloDocs) && !/dominio vigente/i.test(soloDocs));
  await jur.c.from("legal_lvs").update({ estado_civil: "Casado/a", relacion_laboral: false, empleador: null, rut_empleador: null }).eq("client_id", id);
  const docsPage2 = await page(jur, `/documentos/lvs/${id}?tab=Documentación`);
  ok("Documentación · casada y cesante: certificado de matrimonio y 12 cotizaciones en vez de contrato", /Certificado de matrimonio/.test(docsPage2.text) && /cotizaciones/.test(docsPage2.text) && !/Contrato de trabajo/.test(docsPage2.text));

  // Historial: creación + cambios con campos antes/después
  const hist = sql(`select summary, before, after from legal_case_history where client_id = '${id}' and kind = 'lvs' order by at`);
  const fichaHist = hist.filter((h) => /^Ficha LVS:/.test(h.summary));
  ok("Historial · creación y guardado con campos cambiados", hist.length >= 2 && /creado/.test(hist[0].summary) && fichaHist.length >= 1, String(hist.length));
  const last = fichaHist[0];
  ok("Historial · guarda valor anterior y nuevo", last.before?.comuna === null && last.after?.comuna === "Maipú");
  const hpage = await page(jur, `/documentos/lvs/${id}?tab=Historial`);
  ok("Historial en la página muestra los movimientos", hpage.status === 200 && /Expediente LVS creado/.test(hpage.text) && /Ficha LVS:/.test(hpage.text));
  const audit = sql(`select count(*)::int as n from audit_log where entity = 'legal_lvs' and entity_id = '${id}'`);
  ok("Auditoría global registra creación y edición", audit[0].n >= 2, String(audit[0].n));

  // Ficha de la causa enlaza al expediente
  const ficha = await page(jur, `/clientes/${id}`);
  ok("Ficha de la causa · botón «Expediente LVS»", ficha.status === 200 && /Expediente LVS/.test(ficha.text));

  // Borrar el cliente (solo el administrador puede: aquí por SQL) arrastra el expediente y su historial (cascada)
  const del = await jur.c.from("legal_clients").delete().eq("id", id).select();
  ok("Jurídico · no puede borrar clientes (RLS)", (del.data ?? []).length === 0);
  sql(`delete from legal_clients where id = '${id}'`);
  const left = sql(`select count(*)::int as n from legal_lvs where client_id = '${id}'`);
  ok("Borrar el cliente arrastra el expediente", left[0].n === 0);
} catch (e) {
  fails++;
  console.log("ERROR " + e.message);
} finally {
  sql(`delete from legal_clients where full_name like 'LVS Cliente %'`);
  sql(`delete from auth.users where email like 'e2e.%.${stamp}@gmail.com'`);
  sql(`delete from invitations where email like 'e2e.%.${stamp}@gmail.com'`);
  console.log(fails ? `${fails} fallo(s)` : "Todo en verde");
  process.exit(fails ? 1 : 0);
}

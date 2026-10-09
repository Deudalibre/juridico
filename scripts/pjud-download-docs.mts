// Baja los PDFs del Poder Judicial (Oficina Judicial Virtual) y los sube a Vercel Blob; en Supabase queda solo la URL
// (tabla pjud_documentos). Corre desde un PC del estudio, porque el cortafuegos del PJUD rechaza las IP de Vercel.
//
//   npx -y tsx scripts/pjud-download-docs.mts --cuenta C:/ruta/credenciales.txt [--causa-id <uuid>] [--mes 2026-08] [--limite N] [--desde 2026-08-01] [--contacto correo]
//
// Flujo: lee las causas activas con rol y tribunal → por cada una abre el detalle fresco en la OJV (los JWT de descarga
// vencen a la hora) → por cada documento reserva la fila con pjud_documento_reservar (lock: si ya existe o se está
// bajando desde otro PC, se salta) → GET del PDF sin cookies (30 s) → put() en Vercel Blob → pjud_documento_terminar.
// Ritmo: la OJV ya impone 5 s entre consultas (PjudClient); además 2 s entre documentos de la misma causa.
// Independiente de la sincronización (pjud-sync.mts y /api/pjud/sync): no toca pjud_causa_data.
import { put } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { CausaNoEncontrada, PjudBloqueado, PjudClient, normalizarTribunal, urlDocumento, type DetalleCausa } from "../src/lib/pjud";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2).map((x) => x.replace(/^["']|["']$/g, ""))));
const cuenta = opt("--cuenta");
if (!cuenta || !existsSync(cuenta)) {
  console.error("Falta --cuenta <archivo con Usuario:/Correo: y Clave:>");
  process.exit(1);
}
const tokenBlob = process.env.BLOB_READ_WRITE_TOKEN ?? env.BLOB_READ_WRITE_TOKEN;
if (!tokenBlob) {
  console.error("Falta BLOB_READ_WRITE_TOKEN en .env.local (Vercel → Storage → Blob → token). Sin él no hay dónde subir los PDFs.");
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
const soloCausa = opt("--causa-id");
const limite = Number(opt("--limite") ?? 10000);
const inicio = Date.now();
const hora = () => new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago" });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const kb = (n: number) => `${Math.round(n / 1024)} KB`;
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

// Mismo orden que la sincronización (pjud_cola_sync): primero las causas con actuaciones recientes, luego las más antiguas
type Fila = { id: string; rol: string; tribunal: string };
const { data: cola, error } = await supabase.rpc("pjud_cola_sync", { p_limite: null, p_desde: opt("--desde") ?? null });
if (error) {
  console.error("No se pudo leer la cola de causas:", error.message);
  process.exit(1);
}
// --mes AAAA-MM: solo las causas ingresadas ese mes (intake_date)
const mes = opt("--mes");
/** «2026-08» → «2026-09-01» (límite superior del mes, excluido) */
const mesSiguiente = (m: string) => { const [y, mm] = m.split("-").map(Number); return mm === 12 ? `${y + 1}-01-01` : `${y}-${String(mm + 1).padStart(2, "0")}-01`; };
let idsMes: Set<string> | null = null;
if (mes) {
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    console.error("--mes debe ser AAAA-MM, por ejemplo 2026-08");
    process.exit(1);
  }
  const { data: delMes } = await supabase.from("legal_clients").select("id").gte("intake_date", `${mes}-01`).lt("intake_date", mesSiguiente(mes));
  idsMes = new Set((delMes ?? []).map((x) => x.id as string));
}
const pendientes: Fila[] = ((cola ?? []) as { client_id: string; rol: string; tribunal: string }[]).filter((f) => (!soloCausa || f.client_id === soloCausa) && (!idsMes || idsMes.has(f.client_id))).slice(0, limite).map((f) => ({ id: f.client_id, rol: f.rol, tribunal: f.tribunal }));
const { data: tribunales } = await supabase.from("pjud_tribunales").select("codigo, nombre_norm");
const codigoDe = new Map((tribunales ?? []).map((t) => [t.nombre_norm as string, t.codigo as number]));
console.log(`${hora()} · ${pendientes.length} causa(s) por revisar${soloCausa ? ` (solo ${soloCausa})` : ""}`);

const cliente = new PjudClient(opt("--contacto") ?? "juridico@deudalibre.cl");
const UA = `deudalibre-juridico/1.0 (+contacto: ${opt("--contacto") ?? "juridico@deudalibre.cl"})`;
let nuevos = 0;
let bytes = 0;
let saltados = 0;
let errores = 0;
let causasConError = 0;

type Tipo = "actuacion" | "certificado" | "anexo" | "anexo_causa" | "demanda" | "certificado_demanda" | "ebook";
type Doc = { cuaderno: string; folio: number; tipo: Tipo; orden: number; action: string; param: string; token: string; etiqueta: string; referencia?: string; fecha?: string | null };
const nombreSeguro = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "cuaderno";

/** Carpetas de anexos que ya están completas en la base (algún PDF «done»): no se vuelve a abrir la carpeta en la OJV. */
async function carpetasHechas(clientId: string): Promise<Set<string>> {
  const { data } = await supabase.from("pjud_documentos").select("cuaderno, folio, tipo").eq("client_id", clientId).in("tipo", ["anexo", "anexo_causa"]).eq("estado", "done");
  return new Set((data ?? []).map((d) => `${d.tipo}|${d.cuaderno}|${d.folio}`));
}

/**
 * Todos los documentos descargables que publica el detalle: cabecera (texto demanda, certificado de envío, ebook y la
 * carpeta «Anexos de la causa»), y por actuación el documento, el certificado de envío del escrito y la carpeta «Anexo».
 * Las carpetas cuestan una consulta más a la OJV cada una, así que solo se abren si todavía no tienen nada bajado.
 */
async function documentosDe(d: DetalleCausa, clientId: string): Promise<Doc[]> {
  const out: Doc[] = [];
  const cab = (tipo: Tipo, action: string | null, param: string | null, token: string | null, etiqueta: string) => {
    if (action && param && token) out.push({ cuaderno: "", folio: 0, tipo, orden: 0, action, param, token, etiqueta });
  };
  cab("demanda", d.demanda_action, d.demanda_param, d.demanda_token, "texto demanda");
  cab("certificado_demanda", d.cert_demanda_action, d.cert_demanda_param, d.cert_demanda_token, "certificado de envío");
  cab("ebook", d.ebook_action, d.ebook_param, d.ebook_token, "ebook");
  const hechas = await carpetasHechas(clientId);
  if (d.anexos_causa_ref && !hechas.has("anexo_causa||0")) {
    const lista = await cliente.anexosCausa(d.anexos_causa_ref);
    lista.forEach((x, i) => out.push({ cuaderno: "", folio: 0, tipo: "anexo_causa", orden: i, action: x.action, param: x.param, token: x.token, etiqueta: `anexo de la causa ${i + 1}: ${x.referencia}`, referencia: x.referencia, fecha: x.fecha }));
  }
  for (const q of d.cuadernos) {
    const ordenes = new Map<string, number>(); // (folio, tipo) → cuántos van: un folio puede tener varias filas con documento
    const orden = (folio: number, tipo: Tipo) => {
      const k = `${folio}|${tipo}`;
      const n = ordenes.get(k) ?? 0;
      ordenes.set(k, n + 1);
      return n;
    };
    for (const a of q.actuaciones) {
      if (a.folio == null) continue; // sin folio no hay clave estable para el documento
      const folio = a.folio;
      if (a.doc_action && a.doc_param && a.doc_token) out.push({ cuaderno: q.nombre, folio: a.folio, tipo: "actuacion", orden: orden(a.folio, "actuacion"), action: a.doc_action, param: a.doc_param, token: a.doc_token, etiqueta: `folio ${a.folio}` });
      if (a.cert_action && a.cert_param && a.cert_token) out.push({ cuaderno: q.nombre, folio: a.folio, tipo: "certificado", orden: orden(a.folio, "certificado"), action: a.cert_action, param: a.cert_param, token: a.cert_token, etiqueta: `folio ${a.folio} certificado de envío` });
      if (a.anexo_ref && !hechas.has(`anexo|${q.nombre}|${a.folio}`)) {
        const lista = await cliente.anexosSolicitud(a.anexo_ref);
        lista.forEach((x, i) => out.push({ cuaderno: q.nombre, folio, tipo: "anexo", orden: i, action: x.action, param: x.param, token: x.token, etiqueta: `folio ${a.folio} anexo ${i + 1}: ${x.referencia}`, referencia: x.referencia, fecha: x.fecha }));
      }
    }
  }
  return out;
}

async function bajar(doc: Doc): Promise<Buffer> {
  const res = await fetch(urlDocumento(doc.action, doc.param, doc.token), { headers: { "User-Agent": UA, Accept: "application/pdf,*/*" }, signal: AbortSignal.timeout(doc.tipo === "ebook" ? 180_000 : 30_000), redirect: "manual" });
  if (res.status !== 200) throw new Error(`el PJUD respondió ${res.status}`);
  const todo = Buffer.from(await res.arrayBuffer());
  // En los anexos (anexoDocCivil.php) el PJUD antepone un bloque <script> de ~1,6 KB al PDF: se recorta desde «%PDF»
  const inicio = todo.indexOf("%PDF");
  if (inicio < 0 || inicio > 8192) throw new Error(`no vino un PDF (${res.headers.get("content-type") ?? "sin tipo"}, ${todo.length} bytes)`);
  return inicio ? todo.subarray(inicio) : todo;
}

for (const c of pendientes) {
  const rol = c.rol.trim().toUpperCase();
  const tag = `[${rol}]`;
  let detalle: DetalleCausa;
  try {
    const codigo = codigoDe.get(normalizarTribunal(c.tribunal)) ?? 0;
    if (!codigo) console.log(`${tag} sin código de tribunal para «${c.tribunal}»: se busca por nombre (una misma causa puede existir en varios tribunales)`);
    detalle = await cliente.detalleCausa(rol, c.tribunal, codigo);
  } catch (e) {
    causasConError++;
    const msg = (e as Error).message;
    console.log(`${tag} ${e instanceof CausaNoEncontrada ? "no encontrada" : e instanceof PjudBloqueado ? "BLOQUEO" : "error"}: ${msg.slice(0, 200)}`);
    if (e instanceof PjudBloqueado) {
      console.log("Detención total: no se sigue consultando. Revisar antes de reintentar.");
      break;
    }
    continue;
  }
  const docs = await documentosDe(detalle, c.id);
  let primero = true;
  let yaExistian = 0;
  for (const doc of docs) {
    const { data: reserva, error: eRes } = await supabase.rpc("pjud_documento_reservar", { p_client: c.id, p_cuaderno: doc.cuaderno, p_folio: doc.folio, p_tipo: doc.tipo, p_orden: doc.orden, p_referencia: doc.referencia ?? null, p_fecha: doc.fecha ?? null });
    if (eRes) {
      errores++;
      console.log(`${tag} ${doc.etiqueta} → error al reservar: ${eRes.message}`);
      continue;
    }
    if (!reserva) {
      saltados++;
      yaExistian++;
      continue; // ya existe (hecho, o bajándose desde otro PC, o con error hace menos de 1 h)
    }
    if (!primero) await dormir(2000);
    primero = false;
    process.stdout.write(`${tag} ${doc.etiqueta} → subiendo... `);
    try {
      const pdf = await bajar(doc);
      const ruta = `pjud/${c.id}/${doc.cuaderno ? nombreSeguro(doc.cuaderno) : "cabecera"}/${doc.folio}-${doc.tipo}${doc.orden ? `-${doc.orden + 1}` : ""}.pdf`;
      // Store privado: la URL no se abre sola; el programa sirve el PDF con sesión en /api/pjud/doc/[id] (get() con el token)
      const subido = await put(ruta, pdf, { access: "private", contentType: "application/pdf", allowOverwrite: true, token: tokenBlob });
      const { error: eFin } = await supabase.rpc("pjud_documento_terminar", { p_id: reserva, p_url: subido.url, p_key: subido.pathname, p_size: pdf.length });
      if (eFin) throw new Error(`subido, pero no se pudo guardar la URL: ${eFin.message}`);
      nuevos++;
      bytes += pdf.length;
      console.log(`✓ (${kb(pdf.length)})`);
    } catch (e) {
      errores++;
      const msg = (e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message;
      console.log(`error: ${msg.slice(0, 160)} (reintentable en 1h)`);
      await supabase.rpc("pjud_documento_terminar", { p_id: reserva, p_error: msg });
    }
  }
  if (docs.length && yaExistian === docs.length) console.log(`${tag} ${docs.length} documento(s): todos ya existían, skip`);
  else if (!docs.length) console.log(`${tag} sin documentos publicados`);
}

console.log(`\n${hora()} · resumen en ${Math.round((Date.now() - inicio) / 60000)} min`);
console.log(`✓ ${nuevos} PDFs nuevos subidos (${mb(bytes)})`);
console.log(`→ ${saltados} ya existían, skipped`);
console.log(`✗ ${errores} errores (reintentables)${causasConError ? ` · ${causasConError} causa(s) sin detalle` : ""}`);
await supabase.auth.signOut();

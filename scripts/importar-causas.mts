// Importa la planilla «Revisión de causas» del estudio (Excel) a la app: una fila por causa con nombre, RUT, rol,
// tribunal, carátula, el color de la fila (semáforo) y la observación del operador, que pasa a ser una tarea.
//
//   npx -y tsx scripts/importar-causas.mts --cuenta C:/ruta/credenciales.txt --archivo "C:/ruta/Causas Ingresadas.xlsx"
//     --leer            solo lee la planilla y muestra lo que entendió (sin conectarse)
//     --simular         se conecta, compara con la base y muestra qué haría, sin escribir
//     --fecha AAAA-MM-DD  fecha de ingreso para las causas NUEVAS (por defecto, hoy). Las que ya existen conservan
//                       su fecha de ingreso (su mes en Revisión no cambia)
//     --vence N         días de plazo para los apercibimientos pendientes (por defecto 5)
//
// Idempotente: busca cada causa por RUT (o por rol + apellido) y la actualiza; las tareas no se duplican (mismo título).
// Colores de la planilla (leyenda al pie del Excel) → semáforo de la app (acordado el 2026-10-05):
//   amarillo (FFFF00) con patrocinio y poder ok → ok (verde en la app)
//   celeste  (00B0F0) apercibimiento            → apercibimiento (amarillo en la app)
//   rojo     (FF0000) demanda rechazada          → rechazada
//   verde    (92D050) demanda reingresada        → reingresada (celeste en la app)
//   naranjo  (FFC000) nominar                    → nominar
//   azul     (0070C0 / tema 4) patrocinio x zoom → pyp_zoom
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import PizZip from "pizzip";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const flag = (k: string) => args.includes(k);
const archivo = opt("--archivo") ?? "C:/Users/darya/Desktop/Juridico/Causas Ingresadas.xlsx";
const soloLeer = flag("--leer");
const simular = flag("--simular");
const fechaNuevas = opt("--fecha") ?? new Date().toISOString().slice(0, 10);
const diasVence = Number(opt("--vence") ?? 5);
if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNuevas) || Number.isNaN(Date.parse(fechaNuevas))) {
  console.error("--fecha debe ser AAAA-MM-DD");
  process.exit(1);
}
if (!existsSync(archivo)) {
  console.error(`No encuentro la planilla: ${archivo}`);
  process.exit(1);
}

/* ---------------- Lectura del Excel (xlsx = zip con XML; sin dependencias nuevas) ---------------- */

const unescape = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

type Cell = { value: string; fill: string | null };
type Sheet = Map<string, Cell>; // «G9» → celda

function readSheet(path: string): Sheet {
  const zip = new PizZip(readFileSync(path));
  const file = (n: string) => zip.file(n)?.asText() ?? "";
  // Cadenas compartidas: cada <si> puede traer un <t> o varios <r><t>
  const strings = [...file("xl/sharedStrings.xml").matchAll(/<si>(.*?)<\/si>/gs)].map((m) => unescape([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join("")));
  // Rellenos: índice de <fill> → color (rgb o tema), y estilos de celda (cellXfs) → fillId
  const styles = file("xl/styles.xml");
  const fills = [...(styles.match(/<fills[^>]*>(.*?)<\/fills>/s)?.[1] ?? "").matchAll(/<fill>(.*?)<\/fill>/gs)].map((m) => {
    const solid = /patternType="solid"/.test(m[1]);
    const fg = m[1].match(/<fgColor([^/]*)\/>/)?.[1] ?? "";
    if (!solid) return null;
    return attr(fg, "rgb") ?? (attr(fg, "theme") ? `theme${attr(fg, "theme")}` : null);
  });
  const xfs = [...(styles.match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/s)?.[1] ?? "").matchAll(/<xf\b[^>]*>/g)].map((m) => Number(attr(m[0], "fillId") ?? 0));
  const sheet: Sheet = new Map();
  for (const c of file("xl/worksheets/sheet1.xml").matchAll(/<c\b([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
    const ref = attr(c[1], "r");
    if (!ref) continue;
    const t = attr(c[1], "t");
    const s = Number(attr(c[1], "s") ?? -1);
    const inner = c[2] ?? "";
    let value = "";
    if (t === "s") value = strings[Number(inner.match(/<v>(.*?)<\/v>/)?.[1] ?? -1)] ?? "";
    else if (t === "inlineStr") value = unescape([...inner.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((m) => m[1]).join(""));
    else value = unescape(inner.match(/<v>(.*?)<\/v>/)?.[1] ?? "");
    const fill = s >= 0 ? (fills[xfs[s]] ?? null) : null;
    sheet.set(ref, { value, fill: fill && fill !== "FFFFFFFF" && fill !== "theme0" ? fill : null });
  }
  return sheet;
}

/* ---------------- Interpretación de las filas ---------------- */

const COLOR_TO_SEMAFORO: Record<string, string> = {
  FFFFFF00: "ok",
  FF00B0F0: "apercibimiento",
  FFFF0000: "rechazada",
  FF92D050: "reingresada",
  FFFFC000: "nominar",
  FF0070C0: "pyp_zoom",
  theme4: "pyp_zoom", // azul del tema de Office (4472C4)
};
const tidy = (s: string) => s.replace(/\s+/g, " ").trim();
const cleanRut = (rut: string) => rut.replace(/[^0-9kK]/g, "").toUpperCase();
function isValidRut(rut: string): boolean {
  const c = cleanRut(rut);
  if (c.length < 7 || c.length > 9 || !/^\d+$/.test(c.slice(0, -1))) return false;
  let sum = 0;
  let mul = 2;
  for (let i = c.length - 2; i >= 0; i--) {
    sum += Number(c[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return (r === 11 ? "0" : r === 10 ? "K" : String(r)) === c.slice(-1);
}
const formatRut = (c: string) => `${c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${c.slice(-1)}`;
/** «KARINA ABIGAIL CATALAN JARA» → «Karina Abigail Catalan Jara» (partículas en minúscula). */
const PARTICLES = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "do", "dos", "van", "von"]);
const titleCase = (s: string) =>
  tidy(s)
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && PARTICLES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
const sentence = (s: string) => {
  const t = tidy(s).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type TaskPlan = { kind: string; title: string; description: string | null; status: "pendiente" | "completada"; due: boolean };
/** Observación del operador → tarea. En pasado («SE ENVIÓ…») queda completada; lo demás, pendiente. */
function taskFrom(obs: string, contacto: string): TaskPlan | null {
  const o = tidy(obs);
  if (!o) return null;
  const u = o.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ref = contacto ? `Ratificación de poder: ${tidy(contacto)}` : null;
  const done = (kind: string, title: string): TaskPlan => ({ kind, title, description: ref, status: "completada", due: false });
  const todo = (kind: string, title: string, description: string | null = ref): TaskPlan => ({ kind, title, description, status: "pendiente", due: kind === "apercibimiento" });
  if (/^APERC/.test(u)) return todo("apercibimiento", "Apercibimiento del tribunal");
  if (/^SE RATIFIC/.test(u)) return done("otra", "Patrocinio y poder ratificado");
  if (/^SE ENVIO ESCRITO PP/.test(u)) return done("presentar_escrito", "Escrito de patrocinio y poder enviado");
  if (/^SE ENVIO CURSO PROGRESIVO/.test(u)) return done("presentar_escrito", "Escrito de curso progresivo de los autos enviado");
  if (/^SE ENVIO CUMPLE LO ORDENADO/.test(u)) return done("presentar_escrito", "Escrito «cumple lo ordenado» enviado");
  if (/^SE ENVIO RECTIFICA/.test(u)) return done("presentar_escrito", "Escrito «rectifica demanda» enviado");
  if (/^SE (ENVIO|PRESENTO|ACREDITO)/.test(u)) return done("presentar_escrito", sentence(o));
  if (/^NOMINAR/.test(u)) return todo("otra", "Nominar liquidador");
  if (/^REVISAR/.test(u)) return todo("revisar_causa", sentence(o));
  if (/^CURSO PROGRESIVO/.test(u)) return todo("presentar_escrito", "Presentar curso progresivo de los autos");
  if (/^CUMPLE LO ORDENADO/.test(u)) return todo("presentar_escrito", `Presentar escrito: ${o.toLowerCase()}`);
  if (/^RESOLUCION DE INHABILIDAD/.test(u)) return todo("revisar_resolucion", "Revisar resolución de inhabilidad");
  // Texto largo de una resolución: es un apercibimiento con plazo; el texto completo va en el detalle
  const short = o.length > 90 ? `${o.slice(0, 87).trimEnd()}…` : o;
  return todo("apercibimiento", `Apercibimiento: ${short}`, [o, ref].filter(Boolean).join("\n\n"));
}

type Row = {
  n: number;
  nombre: string;
  rut: string | null;
  rutRaw: string;
  phone: string | null;
  clave: string | null;
  rol: string | null;
  tribunal: string | null;
  caratula: string | null;
  semaforo: string | null;
  obs: string;
  contacto: string;
  tasks: TaskPlan[];
  avisos: string[];
};

function parseRows(sheet: Sheet): Row[] {
  const cell = (col: string, r: number) => sheet.get(`${col}${r}`);
  const val = (col: string, r: number) => tidy(cell(col, r)?.value ?? "");
  // Fila de cabecera: la que tiene «N°» en A
  let head = 0;
  for (let r = 1; r < 60 && !head; r++) if (/^N[°º]?$/i.test(val("A", r))) head = r;
  if (!head) throw new Error("No encuentro la fila de cabecera (N° | Nombre cliente | RUT …)");
  const rows: Row[] = [];
  for (let r = head + 1; r < head + 400; r++) {
    const n = Number(val("A", r));
    const nombre = val("B", r);
    if (!nombre) {
      if (n && rows.length) break; // llegó a la leyenda de colores (números sin nombre)
      continue;
    }
    if (!n) continue;
    const avisos: string[] = [];
    const rutRaw = val("C", r);
    let rut: string | null = rutRaw ? cleanRut(rutRaw) : null;
    if (rut && !isValidRut(rut)) {
      avisos.push(`RUT «${rutRaw}» no válido: se guarda sin RUT`);
      rut = null;
    }
    // Columna «Clave única»: a veces trae el teléfono o el RUT repetido
    const d = val("D", r);
    let phone: string | null = null;
    let clave: string | null = null;
    if (d) {
      const digits = d.replace(/\D/g, "");
      if (rut && cleanRut(d) === rut) avisos.push("La columna Clave Única trae el RUT: se ignora");
      else if (/^(\+?56)?9\d{8}$/.test(digits)) phone = `+56 ${digits.slice(-9, -8)} ${digits.slice(-8, -4)} ${digits.slice(-4)}`;
      else if (/^[\d\s+]+$/.test(d) && digits.length >= 9 && digits.length <= 11) {
        phone = d; // solo números: es un teléfono, aunque no tenga el formato del celular (se guarda tal cual)
        avisos.push(`Teléfono «${d}» con formato raro: se guarda tal cual`);
      } else clave = d;
    }
    const semaforo = COLOR_TO_SEMAFORO[cell("G", r)?.fill ?? ""] ?? COLOR_TO_SEMAFORO[cell("H", r)?.fill ?? ""] ?? null;
    if (!semaforo && (cell("G", r)?.fill || cell("H", r)?.fill)) avisos.push(`Color no reconocido: ${cell("G", r)?.fill ?? cell("H", r)?.fill}`);
    const obs = val("H", r);
    const contacto = val("I", r);
    const task = taskFrom(obs, contacto);
    rows.push({
      n,
      nombre: titleCase(nombre),
      rut,
      rutRaw,
      phone,
      clave,
      rol: val("E", r).toUpperCase() || null,
      tribunal: val("F", r) || null,
      caratula: val("G", r).replace(/^\/\s*/, "/") || null,
      semaforo,
      obs,
      contacto,
      tasks: task ? [task] : [],
      avisos,
    });
  }
  // La misma persona en dos filas (p. ej. una segunda observación): una sola causa con todas las tareas
  const merged: Row[] = [];
  for (const row of rows) {
    const prev = merged.find((m) => (row.rut && m.rut === row.rut) || (!row.rut && m.rol && m.rol === row.rol));
    if (!prev) {
      merged.push(row);
      continue;
    }
    prev.tasks.push(...row.tasks);
    prev.semaforo ??= row.semaforo;
    prev.phone ??= row.phone;
    prev.clave ??= row.clave;
    prev.avisos.push(`Fila ${row.n} es la misma causa que la fila ${prev.n}: se unieron`);
  }
  return merged;
}

const SEM_LABEL: Record<string, string> = { ok: "verde · al día", apercibimiento: "amarillo · apercibimiento", rechazada: "rojo · rechazada", reingresada: "celeste · reingresada", nominar: "naranjo · nominar", pyp_zoom: "azul · PyP por Zoom" };

const rows = parseRows(readSheet(archivo));
console.log(`Planilla: ${archivo}\nCausas leídas: ${rows.length}\n`);
const roles = new Map<string, Row[]>();
for (const r of rows) if (r.rol) roles.set(r.rol, [...(roles.get(r.rol) ?? []), r]);
for (const [rol, list] of roles) if (list.length > 1) console.log(`⚠ El rol ${rol} aparece en ${list.length} causas: ${list.map((r) => r.nombre).join(" / ")} (revisar en la planilla)`);

if (soloLeer) {
  for (const r of rows) {
    console.log(`${String(r.n).padStart(2)}. ${r.nombre} · ${r.rut ? formatRut(r.rut) : "sin RUT"} · ${r.rol ?? "sin rol"} · ${r.tribunal ?? "sin tribunal"}`);
    console.log(`    color: ${r.semaforo ? SEM_LABEL[r.semaforo] : "sin color"}${r.phone ? ` · tel ${r.phone}` : ""}${r.clave ? " · Clave Única" : ""}`);
    for (const t of r.tasks) console.log(`    tarea ${t.status === "completada" ? "✓" : "○"} [${t.kind}] ${t.title}${t.due ? ` (vence en ${diasVence} días)` : ""}`);
    for (const a of r.avisos) console.log(`    ⚠ ${a}`);
  }
  process.exit(0);
}

/* ---------------- Conexión (como el abogado/administrador que importa: aplica RLS y queda en el historial) ---------------- */

const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2).map((x) => x.replace(/^["']|["']$/g, ""))));
const cuenta = opt("--cuenta");
if (!cuenta || !existsSync(cuenta)) {
  console.error("Falta --cuenta <archivo con Correo: y Clave:> (o usa --leer para solo revisar la planilla)");
  process.exit(1);
}
const cred = readFileSync(cuenta, "utf8");
const email = cred.match(/Correo:\s*(\S+)/)?.[1] ?? "";
const password = cred.match(/Clave:\s*(\S+)/)?.[1] ?? "";
const supabase: SupabaseClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await supabase.auth.signInWithPassword({ email, password });
if (login.error || !login.data.user) {
  console.error("No se pudo iniciar sesión:", login.error?.message);
  process.exit(1);
}
const userId = login.data.user.id;

type Existing = { id: string; full_name: string; rut: string | null; rol: string | null; tribunal: string | null; caratula: string | null; phone: string | null; procedure_type: string | null; intake_date: string | null; semaforo: string | null; archived_at: string | null };
const { data: existingData, error: exErr } = await supabase.from("legal_clients").select("id, full_name, rut, rol, tribunal, caratula, phone, procedure_type, intake_date, semaforo, archived_at").limit(5000);
if (exErr) {
  console.error("No se pudo leer la cartera:", exErr.message, exErr.message.includes("semaforo") ? "\n¿Corriste la migración 0032? (npm run db:migrate)" : "");
  process.exit(1);
}
const existing = (existingData ?? []) as Existing[];
const surname = (name: string) => name.trim().split(/\s+/).slice(-2).join(" ").toLowerCase();
const findExisting = (r: Row) =>
  (r.rut && existing.find((e) => e.rut && cleanRut(e.rut) === r.rut)) ||
  (r.rol && existing.find((e) => e.rol && e.rol.toUpperCase().trim() === r.rol && e.full_name.toLowerCase().includes(surname(r.nombre).split(" ")[0]))) ||
  null;
const monthName = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-CL", { month: "long", year: "numeric" }) : "sin fecha (en preparación)");

const dueAt = () => {
  // Vence a las 10:00 de Chile (UTC-3 en primavera/verano) dentro de N días
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + diasVence);
  d.setUTCHours(13, 0, 0, 0);
  return d.toISOString();
};

let nuevas = 0;
let actualizadas = 0;
let tareas = 0;
let claves = 0;
for (const r of rows) {
  const ex = findExisting(r);
  const header = `${String(r.n).padStart(2)}. ${r.nombre} · ${r.rut ? formatRut(r.rut) : "sin RUT"} · ${r.rol ?? "sin rol"}`;
  for (const a of r.avisos) console.log(`    ⚠ ${a}`);
  let clientId: string;
  if (ex) {
    // Ya está en la app: conserva su fecha de ingreso (su mes), su abogado y su procedimiento; se actualiza lo demás
    const patch: Record<string, unknown> = {};
    if (r.rol && r.rol !== (ex.rol ?? "").toUpperCase().trim()) patch.rol = r.rol;
    if (r.tribunal && r.tribunal !== ex.tribunal) patch.tribunal = r.tribunal;
    if (r.caratula && r.caratula !== ex.caratula) patch.caratula = r.caratula;
    if (r.phone && !ex.phone) patch.phone = r.phone;
    if (!ex.procedure_type) patch.procedure_type = "Liquidación voluntaria";
    if (r.semaforo && r.semaforo !== ex.semaforo) patch.semaforo = r.semaforo;
    const changes = Object.keys(patch);
    console.log(`${header}\n    ya existe (${monthName(ex.intake_date)}${ex.archived_at ? ", CERRADA" : ""})${changes.length ? ` · actualiza ${changes.join(", ")}` : " · sin cambios"}`);
    if (changes.length && !simular) {
      const { error } = await supabase.from("legal_clients").update(patch).eq("id", ex.id);
      if (error) {
        console.error("    ✗ no se pudo actualizar:", error.message);
        continue;
      }
      actualizadas++;
    }
    clientId = ex.id;
  } else {
    const insert = {
      full_name: r.nombre,
      rut: r.rut,
      phone: r.phone,
      procedure_type: "Liquidación voluntaria",
      rol: r.rol,
      tribunal: r.tribunal,
      caratula: r.caratula,
      intake_date: fechaNuevas,
      semaforo: r.semaforo,
    };
    console.log(`${header}\n    NUEVA · ingreso ${monthName(fechaNuevas)} · ${r.semaforo ? SEM_LABEL[r.semaforo] : "sin color"}`);
    if (simular) {
      clientId = "";
    } else {
      const { data, error } = await supabase.from("legal_clients").insert(insert).select("id").single();
      if (error) {
        console.error("    ✗ no se pudo crear:", error.message);
        continue;
      }
      clientId = data.id as string;
      existing.push({ id: clientId, full_name: r.nombre, rut: r.rut, rol: r.rol, tribunal: r.tribunal, caratula: r.caratula, phone: r.phone, procedure_type: insert.procedure_type, intake_date: fechaNuevas, semaforo: r.semaforo, archived_at: null });
      nuevas++;
    }
  }
  // Clave Única (cifrada en la bóveda; exige sesión con legal.edit)
  if (r.clave) {
    console.log("    Clave Única: se guarda en la bóveda");
    if (!simular && clientId) {
      const { error } = await supabase.rpc("legal_set_clave_unica", { p_client: clientId, p_value: r.clave });
      if (error) console.error("    ✗ Clave Única:", error.message);
      else claves++;
    }
  }
  // Tareas del operador (sin duplicar: mismo título en la causa)
  if (r.tasks.length) {
    const { data: prev } = clientId ? await supabase.from("legal_tasks").select("title").eq("client_id", clientId) : { data: [] as { title: string }[] };
    const titles = new Set((prev ?? []).map((t) => t.title));
    for (const t of r.tasks) {
      if (titles.has(t.title)) {
        console.log(`    tarea ya registrada: ${t.title}`);
        continue;
      }
      console.log(`    tarea ${t.status === "completada" ? "✓ completada" : "○ pendiente"} [${t.kind}] ${t.title}${t.due ? ` · vence en ${diasVence} días` : ""}`);
      if (simular || !clientId) continue;
      const now = new Date().toISOString();
      const row =
        t.status === "completada"
          ? { client_id: clientId, kind: t.kind, title: t.title, description: t.description, status: "completada", result: `Según planilla del operador (${r.obs})`, closed_by: userId, completed_at: now }
          : { client_id: clientId, kind: t.kind, title: t.title, description: t.description, status: "pendiente", due_at: t.due ? dueAt() : null };
      const { error } = await supabase.from("legal_tasks").insert(row);
      if (error) console.error("    ✗ tarea:", error.message);
      else tareas++;
    }
  }
}
console.log(`\n${simular ? "SIMULACIÓN · nada se escribió" : `Listo`} · nuevas ${nuevas} · actualizadas ${actualizadas} · tareas ${tareas} · claves únicas ${claves}`);
await supabase.auth.signOut();

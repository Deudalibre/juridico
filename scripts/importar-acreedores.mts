// Importa el catálogo de acreedores desde el Word del estudio (Importar/Formato Juridico/ACREEDORES ACTUALIZADOS.docx):
// bloques «Nombre: $monto…», «RUT: …», «Domicilio: …», «Representante legal: …», «Correo electrónico: …»,
// «Fono: …», «La naturaleza del crédito consta en …». Un acreedor por RUT; los nombres repetidos quedan como alias.
//   npx -y tsx scripts/importar-acreedores.mts --cuenta C:/ruta/credenciales.txt
// Idempotente: actualiza por RUT (upsert) sin borrar lo que se haya agregado a mano.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import PizZip from "pizzip";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const cuenta = opt("--cuenta");
if (!cuenta || !existsSync(cuenta)) {
  console.error("Falta --cuenta <archivo con Correo: y Clave:>");
  process.exit(1);
}
const cred = readFileSync(cuenta, "utf8");
const email = cred.match(/Correo:\s*(\S+)/)?.[1] ?? "";
const password = cred.match(/Clave:\s*(\S+)/)?.[1] ?? "";
const archivo = opt("--archivo") ?? "C:/Users/magne/Desktop/juridico/Importar/Formato Juridico/ACREEDORES ACTUALIZADOS.docx";

const xml = new PizZip(readFileSync(archivo)).file("word/document.xml")!.asText();
const text = xml
  .replace(/<w:tab\/>/g, " ")
  .replace(/<\/w:p>/g, "\n")
  .replace(/<w:br[^>]*\/>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/\u00a0/g, " ");
const lines = text.split("\n").map((l) => l.trim());
const blocks: string[][] = [];
let cur: string[] = [];
for (const l of lines) {
  if (!l) {
    if (cur.length) blocks.push(cur);
    cur = [];
  } else cur.push(l);
}
if (cur.length) blocks.push(cur);

const cleanRut = (s: string | null) => (s ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
const fmtRut = (s: string | null) => {
  const c = cleanRut(s);
  if (c.length < 8) return null;
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${c.slice(-1)}`;
};
const tidy = (s: string | null) => (s ? s.replace(/^[^:]*:\s*/, "").replace(/[.\s]+$/, "").replace(/^representante legal\s*/i, "").trim() || null : null);

type Rec = { nombre: string; rut: string | null; domicilio: string | null; representante: string | null; rut_representante: string | null; email: string | null; telefono: string | null; naturaleza: string | null };
const recs: Rec[] = [];
for (const b of blocks) {
  const nombre = b[0].replace(/[:,]?\s*\$.*$/, "").replace(/[:,.]\s*$/, "").trim();
  if (!nombre || nombre.length > 160) continue;
  const r: Rec = { nombre, rut: null, domicilio: null, representante: null, rut_representante: null, email: null, telefono: null, naturaleza: null };
  for (const l of b.slice(1)) {
    if (/^r\.?u\.?t\.?\s+(del\s+)?representante/i.test(l)) r.rut_representante = fmtRut(tidy(l));
    else if (/^r\.?u\.?t\b/i.test(l)) r.rut = fmtRut(tidy(l));
    else if (/^domicili/i.test(l)) r.domicilio = tidy(l);
    else if (/^representante/i.test(l)) r.representante = tidy(l);
    else if (/^correo/i.test(l) || /^e-?mail/i.test(l)) r.email = tidy(l)?.toLowerCase() ?? null;
    else if (/^(fono|tel[eé]fono|celular)/i.test(l)) r.telefono = tidy(l);
    else if (/naturaleza del cr[eé]dito/i.test(l)) r.naturaleza = l.replace(/^la naturaleza del cr[eé]dito\s*(consta en|:)?\s*/i, "").replace(/\.$/, "").trim() || null;
  }
  if (r.email && !/@/.test(r.email)) r.email = null; // «www.fonasa.cl» no es un correo
  recs.push(r);
}
// Un registro por RUT; nombres distintos para el mismo RUT → alias
const porRut = new Map<string, Rec & { alias: string[] }>();
const sinRut: (Rec & { alias: string[] })[] = [];
for (const r of recs) {
  if (!r.rut) {
    sinRut.push({ ...r, alias: [] });
    continue;
  }
  const k = cleanRut(r.rut);
  const prev = porRut.get(k);
  if (!prev) porRut.set(k, { ...r, alias: [] });
  else {
    if (r.nombre !== prev.nombre && !prev.alias.includes(r.nombre)) prev.alias.push(r.nombre);
    for (const f of ["domicilio", "representante", "rut_representante", "email", "telefono", "naturaleza"] as const) if (!prev[f] && r[f]) prev[f] = r[f];
  }
}
console.log(`bloques ${blocks.length} · registros ${recs.length} · acreedores por RUT ${porRut.size} · sin RUT ${sinRut.length}`);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await supabase.auth.signInWithPassword({ email, password });
if (login.error) {
  console.error("No se pudo iniciar sesión:", login.error.message);
  process.exit(1);
}
const filas = [...porRut.values()].map((r) => ({ nombre: r.nombre, rut: r.rut, alias: r.alias, domicilio: r.domicilio, representante: r.representante, rut_representante: r.rut_representante, email: r.email, telefono: r.telefono, naturaleza: r.naturaleza, origen: "importado" as const }));
let ok = 0;
for (let i = 0; i < filas.length; i += 50) {
  const lote = filas.slice(i, i + 50);
  const { error } = await supabase.from("legal_acreedores").upsert(lote, { onConflict: "rut" });
  if (error) {
    console.error("Error en el lote", i / 50 + 1, error.message);
    process.exit(1);
  }
  ok += lote.length;
}
// Los que no traen RUT se insertan solo si no existe uno con el mismo nombre
for (const r of sinRut) {
  const { data: ya } = await supabase.from("legal_acreedores").select("id").ilike("nombre", r.nombre).maybeSingle();
  if (ya) continue;
  const { error } = await supabase.from("legal_acreedores").insert({ nombre: r.nombre, rut: null, alias: [], domicilio: r.domicilio, representante: r.representante, rut_representante: r.rut_representante, email: r.email, telefono: r.telefono, naturaleza: r.naturaleza, origen: "importado" });
  if (!error) ok++;
}
const { count } = await supabase.from("legal_acreedores").select("id", { count: "exact", head: true });
console.log(`importados/actualizados ${ok} · catálogo total ${count}`);
await supabase.auth.signOut();

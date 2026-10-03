// Prepara los anexos oficiales (Importar/Formato Juridico/) con las marcas de docxtemplater y los carga en la app
// como plantillas con «slot». Se ejecuta con una cuenta con permiso documents.edit (jurídico o administrador):
//   npx -y tsx scripts/plantillas-lvs.mts --cuenta C:/ruta/credenciales.txt [--solo anexo8]
// El archivo de credenciales tiene dos líneas «Correo: …» y «Clave: …». Idempotente: si el slot ya existe,
// sube una versión nueva (vN.docx) y actualiza la fila.
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PREPARADORES } from "../src/lib/lvs-anexos";
import { DOCX_MIME, TEMPLATE_BUCKET } from "../src/lib/templates";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const cuenta = opt("--cuenta");
if (!cuenta || !existsSync(cuenta)) {
  console.error("Falta --cuenta <archivo con Correo: y Clave:>");
  process.exit(1);
}
const cred = readFileSync(cuenta, "utf8");
const email = cred.match(/Correo:\s*(\S+)/)?.[1];
const password = cred.match(/Clave:\s*(\S+)/)?.[1];
if (!email || !password) {
  console.error("El archivo de credenciales no tiene «Correo:» y «Clave:»");
  process.exit(1);
}
const dir = "C:/Users/magne/Desktop/juridico/Importar/Formato Juridico";
const outDir = join(dir, "preparadas");
mkdirSync(outDir, { recursive: true });

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await supabase.auth.signInWithPassword({ email, password });
if (login.error) {
  console.error("No se pudo iniciar sesión:", login.error.message);
  process.exit(1);
}
const userId = login.data.user.id;

const solo = opt("--solo");
for (const [slot, def] of Object.entries(PREPARADORES)) {
  if (solo && solo !== slot) continue;
  const original = readFileSync(join(dir, def.archivo));
  const prepared = def.preparar(original);
  writeFileSync(join(outDir, `${slot}.docx`), prepared);
  const { data: existing } = await supabase.from("legal_templates").select("id, version").eq("slot", slot).maybeSingle();
  const id = existing?.id ?? randomUUID();
  const version = (existing?.version ?? 0) + 1;
  const path = `${id}/v${version}.docx`;
  const up = await supabase.storage.from(TEMPLATE_BUCKET).upload(path, prepared, { contentType: DOCX_MIME, cacheControl: "0", upsert: false });
  if (up.error) {
    console.error(`${slot}: no se pudo subir el Word: ${up.error.message}`);
    process.exit(1);
  }
  const variables = def.variables.map((name) => ({ name, label: name.replace(/_/g, " "), type: "texto", source: name === "nombre_completo" || name === "rut" ? name : null }));
  const row = { name: def.nombre, procedure_type: "Liquidación voluntaria", storage_path: path, file_name: `${slot}.docx`, file_size: prepared.length, version, variables, slot, description: `Preparado desde «${def.archivo}» con las marcas de la app.` };
  const res = existing ? await supabase.from("legal_templates").update(row).eq("id", id) : await supabase.from("legal_templates").insert({ id, ...row, created_by: userId });
  if (res.error) {
    console.error(`${slot}: no se pudo registrar la plantilla: ${res.error.message}`);
    process.exit(1);
  }
  console.log(`${slot}: ${existing ? "actualizada" : "creada"} · versión ${version} · ${prepared.length} bytes · ${path}`);
}
await supabase.auth.signOut();

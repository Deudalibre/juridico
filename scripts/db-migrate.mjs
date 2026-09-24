// Aplica las migraciones de supabase/migrations usando la Management API de Supabase.
//
//   npm run db:migrate              → ejecuta todos los .sql en orden (son idempotentes)
//   npm run db:sql -- "select 1"    → ejecuta una consulta suelta (útil para corregir la BD)
//
// Lee NEXT_PUBLIC_SUPABASE_URL y SUPABASE_ACCESS_TOKEN de .env.local.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  const file = join(root, ".env.local");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const token = env.SUPABASE_ACCESS_TOKEN ?? "";
const ref = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];

if (!ref || !token.startsWith("sbp_")) {
  console.error("Faltan credenciales en .env.local: NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co) y SUPABASE_ACCESS_TOKEN (sbp_...).");
  process.exit(1);
}

async function run(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

const [mode, ...rest] = process.argv.slice(2);

try {
  if (mode === "sql") {
    const query = rest.join(" ");
    if (!query) throw new Error('Uso: npm run db:sql -- "select ..."');
    console.log(JSON.stringify(await run(query), null, 2));
  } else {
    const dir = join(root, "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      process.stdout.write(`→ ${f} … `);
      await run(readFileSync(join(dir, f), "utf8"));
      console.log("ok");
    }
    console.log(`Migraciones aplicadas en el proyecto ${ref}.`);
  }
} catch (e) {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
}

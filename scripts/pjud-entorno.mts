// Credenciales y variables para los scripts que corren contra el Poder Judicial (pjud-sync.mts, pjud-download-docs.mts),
// válido tanto en la PC del estudio (Programador de tareas, --cuenta <archivo>, .env.local en disco) como en un
// contenedor (Cloud Run Job en southamerica-west1: variables de entorno desde Secret Manager, sin archivos; ni .env.local ni el .txt de credenciales existen).
import { existsSync, readFileSync } from "node:fs";

/** .env.local si existe (PC del estudio); si no, las variables ya puestas en el entorno (Secret Manager en Cloud Run, Docker --env). */
export function cargarEnv(): Record<string, string> {
  if (existsSync(".env.local")) {
    const archivo = Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => l.split(/=(.*)/s).slice(0, 2).map((x) => x.replace(/^["']|["']$/g, ""))),
    );
    return { ...process.env, ...archivo } as Record<string, string>;
  }
  return process.env as Record<string, string>;
}

/**
 * Usuario y clave de la cuenta del CRM con la que se guarda en Supabase (necesita legal.edit).
 *  - PC del estudio: --cuenta C:/ruta/credenciales.txt, con líneas «Correo:»/«Usuario:» y «Clave:».
 *  - Contenedor (Cloud Run): variables PJUD_CUENTA_EMAIL y PJUD_CUENTA_CLAVE (desde Secret Manager, nunca en el Dockerfile).
 * --cuenta manda si se pasa; si no, caen a las variables de entorno.
 */
export function cargarCuenta(opt: (k: string) => string | undefined): { email: string; password: string } {
  const archivo = opt("--cuenta");
  if (archivo) {
    if (!existsSync(archivo)) {
      console.error(`Falta el archivo de --cuenta: ${archivo}`);
      process.exit(1);
    }
    const cred = readFileSync(archivo, "utf8");
    return { email: cred.match(/(?:Correo|Usuario):\s*(\S+)/)?.[1] ?? "", password: cred.match(/Clave:\s*(\S+)/)?.[1] ?? "" };
  }
  const email = process.env.PJUD_CUENTA_EMAIL ?? "";
  const password = process.env.PJUD_CUENTA_CLAVE ?? "";
  if (!email || !password) {
    console.error("Faltan credenciales: pasar --cuenta <archivo> o definir PJUD_CUENTA_EMAIL y PJUD_CUENTA_CLAVE en el entorno.");
    process.exit(1);
  }
  return { email, password };
}

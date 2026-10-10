// Prueba real del cliente de la Oficina Judicial Virtual con causas del estudio, sin tocar la base.
//   npx -y tsx scripts/pjud-prueba.mts "C-12971-2026|13º Juzgado Civil de Santiago" "C-1740-2026|1º Juzgado Civil de Valparaíso"
// Opciones: --contacto correo@dominio.cl (User-Agent), --codigos (resuelve el código del tribunal con los combos de
// la OJV; sin esta opción busca sin tribunal y elige la fila por el nombre), --json carpeta (guarda el detalle).
//
// ⚠ Este script SÍ toca el PJUD real (no es un mock), aunque no quede registrado en pjud_corridas (no tiene sesión):
// correrlo varias veces el mismo día que ya corrió pjud-sync.mts o pjud-download-docs.mts suma al mismo volumen desde
// la misma IP que un día (9-10 oct 2026) hizo que el cortafuegos F5 empezara a interponer su desafío JavaScript.
// Antes de correrlo, confirmar que hoy no hubo ya una corrida completa (select * from pjud_corridas donde
// iniciado_at::date = hoy): si la hubo, esperar a mañana en vez de sumar otra pasada manual al mismo día.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PjudClient, PjudBloqueado, CausaNoEncontrada, EstructuraInesperada, PjudNoRespondio, normalizarTribunal, type Tribunal } from "../src/lib/pjud";

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const flag = (k: string) => args.includes(k);
const contacto = opt("--contacto") ?? "juridico@deudalibre.cl";
const carpeta = opt("--json");
const causas = args.filter((a) => a.includes("|") && !a.startsWith("--")).map((a) => a.split("|").map((s) => s.trim()) as [string, string]);
if (!causas.length) {
  console.error("Indica al menos una causa como \"ROL|Tribunal\".");
  process.exit(1);
}
if (carpeta) mkdirSync(carpeta, { recursive: true });

const cliente = new PjudClient(contacto);
const t0 = Date.now();
let tribunales: Tribunal[] = [];
if (flag("--codigos")) {
  const cortes = await cliente.listarCortes();
  console.log(`Cortes: ${cortes.length}`);
  for (const c of cortes) tribunales.push(...(await cliente.listarTribunalesCiviles(c.codigo)));
  console.log(`Tribunales civiles: ${tribunales.length}`);
  if (carpeta) writeFileSync(join(carpeta, "tribunales.json"), JSON.stringify(tribunales, null, 2));
}

let ok = 0;
for (const [rol, tribunal] of causas) {
  const inicio = Date.now();
  try {
    let codigo = 0;
    if (tribunales.length) {
      const quiero = normalizarTribunal(tribunal);
      const t = tribunales.find((x) => normalizarTribunal(x.nombre) === quiero);
      if (!t) throw new CausaNoEncontrada(`Tribunal «${tribunal}» no está en la lista de la OJV (normalizado: «${quiero}»).`);
      codigo = t.codigo;
    }
    const d = await cliente.detalleCausa(rol, tribunal, codigo);
    ok++;
    const n = d.cuadernos.reduce((a, c) => a + c.actuaciones.length, 0);
    const ultima = d.cuadernos.flatMap((c) => c.actuaciones).sort((a, b) => (b.folio ?? -1) - (a.folio ?? -1))[0];
    console.log(`OK   ${rol} · ${d.tribunal} · ${d.estado_proc || "?"} / ${d.estado_adm || "?"} · ingreso ${d.fecha_ingreso ?? "?"} · ${d.partes.length} partes · ${d.cuadernos.length} cuaderno(s) · ${n} actuaciones · última: folio ${ultima?.folio} ${ultima?.tramite} «${(ultima?.descripcion ?? "").slice(0, 60)}» (${ultima?.fecha_registro}) · ${d.peticiones} peticiones · ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
    if (carpeta) writeFileSync(join(carpeta, `${rol}.json`), JSON.stringify(d, null, 2));
  } catch (e) {
    const tipo = e instanceof PjudBloqueado ? "BLOQUEO" : e instanceof CausaNoEncontrada ? "NO ENCONTRADA" : e instanceof EstructuraInesperada ? "ESTRUCTURA" : e instanceof PjudNoRespondio ? "SIN RESPUESTA" : "ERROR";
    console.log(`FAIL ${rol} · ${tipo}: ${(e as Error).message}`);
    if (e instanceof PjudBloqueado) break;
  }
}
console.log(`\n${ok}/${causas.length} causas leídas · ${cliente.bitacora.length} peticiones en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const b of cliente.bitacora) console.log(`  ${b.metodo} ${b.url.replace("https://oficinajudicialvirtual.pjud.cl", "")} → ${b.estado} en ${b.ms} ms${b.durmio ? ` (esperó ${b.durmio} ms)` : ""}`);

// Tribunal competente por comuna (Código Orgánico de Tribunales, arts. 28 a 40). Sin servidor ni base.
// Uso: npm run test:tribunales
import { COMUNAS, tribunalPara } from "../src/lib/tribunales";

let fails = 0;
const ok = (label: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${extra ? " · " + extra : ""}`);
};
const t = (comuna: string) => tribunalPara(comuna);

ok("Maipú → juzgados civiles de Santiago (provincia de Santiago)", t("Maipú")?.encabezado === "S.J.L. Civil de Santiago" && t("Maipú")?.region === "Metropolitana", t("Maipú")?.encabezado);
ok("Lo Espejo → juzgados civiles de San Miguel (las nueve comunas del sur)", t("Lo Espejo")?.encabezado === "S.J.L. Civil de San Miguel");
ok("Pirque → Puente Alto (provincia de Cordillera)", t("Pirque")?.encabezado === "S.J.L. Civil de Puente Alto");
ok("Pozo Almonte → juzgado de letras de competencia común", t("Pozo Almonte")?.encabezado === "S.J.L. de Pozo Almonte" && t("Pozo Almonte")?.tipo === "comun");
ok("Curacaví → tribunal de Casablanca pero región Metropolitana", t("Curacaví")?.asiento === "Casablanca" && t("Curacaví")?.region === "Metropolitana");
ok("Lampa → Colina (provincia de Chacabuco)", t("Lampa")?.encabezado === "S.J.L. de Colina");
ok("Alhué → Melipilla (provincia de Melipilla)", t("Alhué")?.encabezado === "S.J.L. de Melipilla");
ok("San Pedro de Atacama → Calama (provincia de El Loa)", t("San Pedro de Atacama")?.encabezado === "S.J.L. de Calama");
ok("Hualpén → juzgados civiles de Talcahuano", t("Hualpén")?.encabezado === "S.J.L. Civil de Talcahuano" && t("Hualpén")?.region === "Biobío");
ok("Tucapel → Yungay (Ñuble, aunque Tucapel es de la provincia de Biobío)", t("Tucapel")?.encabezado === "S.J.L. de Yungay");
ok("Torres del Paine → Natales (provincia de Última Esperanza)", t("Torres del Paine")?.encabezado === "S.J.L. de Natales");
ok("Camarones → juzgados civiles de Arica", t("Camarones")?.encabezado === "S.J.L. Civil de Arica");
ok("Acepta mayúsculas y sin tildes («MAIPU», «nunoa»)", t("MAIPU")?.asiento === "Santiago" && t("nunoa")?.asiento === "Santiago" && t("  Viña del mar ")?.asiento === "Viña del Mar");
ok("Variantes de nombre (Llay-Llay, Coihaique, Puerto Natales)", t("Llay-Llay")?.asiento === "San Felipe" && t("Coihaique")?.asiento === "Coyhaique" && t("Puerto Natales")?.asiento === "Natales");
ok("Comuna desconocida → null (el operador escribe el tribunal a mano)", t("Narnia") === null && t("") === null && t(null) === null);
ok("La lista para el autocompletado tiene las 346 comunas del país (aprox.)", COMUNAS.length >= 340 && COMUNAS.length <= 350, String(COMUNAS.length));
ok("Sin comunas repetidas en la lista", new Set(COMUNAS).size === COMUNAS.length);

console.log(fails ? `${fails} fallo(s)` : "Todo en verde");
process.exit(fails ? 1 : 0);

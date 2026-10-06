// Preparación de la Solicitud LVS (demanda) a partir del modelo del estudio: las variables del Word se normalizan y
// cada párrafo que depende de la ficha se desdobla en variantes {#x}…{/x} / {^x}…{/x}. Las redacciones que el modelo
// no traía están en REDACCIONES, todas juntas, para que el abogado las revise y corrija en un solo lugar.
// Solo servidor (usa docx.ts).
import { cloneParagraphAfter, readDocx, replaceText, setParagraphText, templateError, type Block, type Para } from "./docx";

/**
 * Textos que el modelo no traía (el modelo trae un solo caso por bloque). Siguen la forma de los párrafos vecinos del
 * propio modelo. PENDIENTE DE REVISIÓN DEL ABOGADO: cualquier cambio de redacción se hace aquí.
 */
export const REDACCIONES = {
  raices_si: "Bienes raíces: La parte deudora declara ser propietaria de los bienes raíces singularizados en el Anexo N.º 3, acompañado en el segundo otrosí de esta presentación.",
  vehiculos_si: "Vehículos y otros bienes registrables: La parte deudora declara los vehículos motorizados y otros bienes registrables singularizados en el Anexo N.º 4, acompañado en el segundo otrosí de esta presentación.",
  aguas_si: "Derechos de aprovechamiento de aguas y concesiones: La parte deudora declara ser titular de los derechos de aprovechamiento de aguas y concesiones singularizados en el Anexo N.º 5, acompañado en el segundo otrosí de esta presentación.",
  participaciones_no: "Derechos o acciones (participación) y comunidades hereditarias: La parte deudora declara no mantener derechos o acciones en entidades ni participación en comunidades hereditarias, razón por la cual no se acompaña Anexo N.º 6.",
  instrumentos_si: "Instrumentos financieros transables: La parte deudora declara los instrumentos financieros transables singularizados en el Anexo N.º 7, acompañado en el segundo otrosí de esta presentación.",
  muebles_no: "Otros bienes muebles y financieros: La parte deudora no posee otros bienes muebles y financieros que informar, razón por la cual no se acompaña Anexo N.º 8.",
  dominio_raices: "Bienes raíces: Certificados de dominio vigente de los inmuebles singularizados en el Anexo N.º 3, según documentos acompañados en el segundo otrosí de esta presentación.",
  dominio_vehiculos: "Vehículos y otros bienes registrables: Certificados de anotaciones vigentes de los vehículos singularizados en el Anexo N.º 4, según documentos acompañados en el segundo otrosí de esta presentación.",
  contrato_si: "Copia de contrato de trabajo suscrito con {empleador} y tres últimas liquidaciones de sueldo, según documentos acompañados en el segundo otrosí de esta presentación.",
  contrato_no: "Certificado de cotizaciones previsionales de los últimos doce meses, según documentos acompañados en el segundo otrosí de esta presentación.",
  excluidos_no: "La parte deudora no posee bienes legalmente excluidos del procedimiento.",
  juicios_si: "La parte deudora declara los siguientes juicios pendientes:",
  juicio: "Causa rol {rol}, seguida ante el {tribunal}{#corte}, Corte de Apelaciones de {corte}{/corte}, caratulada «{caratula}», en calidad de {calidad}{#estado}, actualmente {estado}{/estado}{#monto}, por un monto de {monto}{/monto}.",
  doc_cotizaciones: "Certificado de cotizaciones previsionales de los últimos doce meses de {don_dona} {nombre_completo}.",
  doc_matrimonio: "Certificado de Matrimonio, emitido por el Servicio de Registro Civil e Identificación, respecto de {don_dona} {nombre_completo}.",
  doc_anexo3: "Anexo N.º 3 correspondiente al numeral 1 del artículo 273 A de la Ley 20.720, relativo a bienes raíces de la parte deudora.",
  doc_dominio: "Certificado de dominio vigente del inmueble {descripcion}, emitido por el {conservador}.",
  doc_anexo4: "Anexo N.º 4 correspondiente al numeral 1 del artículo 273 A de la Ley 20.720, relativo a vehículos motorizados y otros bienes registrables de la parte deudora.",
  doc_cav: "Certificado de anotaciones vigentes del vehículo placa patente {patente}, emitido por el Servicio de Registro Civil e Identificación.",
  doc_anexo5: "Anexo N.º 5 correspondiente al numeral 1 del artículo 273 A de la Ley 20.720, relativo a derechos de aprovechamiento de aguas y concesiones de la parte deudora.",
  doc_anexo6: "Anexo N.º 6 correspondiente al numeral 1 del artículo 273 A de la Ley 20.720, relativo a derechos o acciones en entidades y comunidades hereditarias de la parte deudora.",
  doc_anexo7: "Anexo N.º 7 correspondiente al numeral 1 del artículo 273 A de la Ley 20.720, relativo a valores (instrumentos financieros transables) de la parte deudora.",
  doc_juicio: "Copia del expediente electrónico de la causa rol {rol}, seguida ante el {tribunal}.",
} as const;

/** Variables de la demanda que son redacción y no datos: conservan letra y minúsculas (además de don/doña, etc.). */
export const TEXTO_FIJO_DEMANDA = ["anexos_excluidos", "carta_de_insolvencia"];

const parrafos = (buf: Buffer): Para[] => {
  const out: Para[] = [];
  const visit = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "p") out.push(b);
      else for (const row of b.rows) for (const cell of row) visit(cell);
    }
  };
  visit(readDocx(buf).blocks);
  return out;
};

/** Párrafo del modelo que empieza con `prefijo` (exactamente uno). */
function buscar(buf: Buffer, prefijo: string): Para {
  const hits = parrafos(buf).filter((p) => p.text.trim().startsWith(prefijo));
  if (hits.length !== 1) throw new Error(`En la Solicitud se esperaba un párrafo que empiece con «${prefijo}» y hay ${hits.length}.`);
  return hits[0];
}

/** Sustituye el párrafo por `{#flag}` y cuelga debajo las variantes: si … {/flag} {^flag} no … {/flag}. */
function desdoblar(buf: Buffer, prefijo: string, flag: string, si: string[], no: string[]): Buffer {
  const p = buscar(buf, prefijo);
  buf = setParagraphText(buf, p.i, `{#${flag}}`);
  return cloneParagraphAfter(buf, p.i, [...si, `{/${flag}}`, `{^${flag}}`, ...no, `{/${flag}}`]);
}

/** Cuelga párrafos debajo del que empieza con `prefijo`, sin tocarlo. */
function colgar(buf: Buffer, prefijo: string, textos: string[]): Buffer {
  const p = buscar(buf, prefijo);
  return cloneParagraphAfter(buf, p.i, textos);
}

const R = REDACCIONES;

/**
 * Solicitud LVS: normaliza las variables del modelo y desdobla los bloques que dependen de la ficha. Se trabaja
 * de atrás hacia adelante para que las búsquedas por texto no tropiecen con los párrafos nuevos.
 */
export function prepararDemanda(original: Buffer): Buffer {
  let buf = original;
  for (const [de, a] of [
    ["{profesión_oficio}", "{profesion_oficio}"],
    ["{región}", "{region}"],
    ["{SJ_COMUNA}", "{sj_comuna}"],
    ["{domicilio}{comuna}", "{domicilio}, {comuna}"],
  ] as const) {
    buf = replaceText(buf, de, a).buf;
  }

  // ---- Segundo otrosí (lista de documentos), de abajo hacia arriba ----
  // Expedientes de los juicios, al final de la lista
  buf = colgar(buf, "Anexo N.º 11 correspondiente", ["{#tiene_juicios}", "{#juicios}", R.doc_juicio, "{/juicios}", "{/tiene_juicios}"]);
  // Anexo 8 solo si hay bienes muebles
  const a8 = buscar(buf, "Anexo N.º 8 correspondiente");
  buf = setParagraphText(buf, a8.i, "{#tiene_bienes_muebles}");
  buf = cloneParagraphAfter(buf, a8.i, [a8.text, "{/tiene_bienes_muebles}"]);
  // Certificado de (no) matrimonio según estado civil; después, los anexos 3 a 7 con sus certificados
  const mat = buscar(buf, "Certificado de no Matrimonio");
  buf = setParagraphText(buf, mat.i, "{#soltero}");
  buf = cloneParagraphAfter(buf, mat.i, [
    mat.text, "{/soltero}", "{#casado}", R.doc_matrimonio, "{/casado}",
    "{#tiene_bienes_raices}", R.doc_anexo3, "{#raices}", R.doc_dominio, "{/raices}", "{/tiene_bienes_raices}",
    "{#tiene_vehiculos}", R.doc_anexo4, "{#vehiculos}", R.doc_cav, "{/vehiculos}", "{/tiene_vehiculos}",
    "{#tiene_aguas}", R.doc_anexo5, "{/tiene_aguas}",
    "{#tiene_participaciones}", R.doc_anexo6, "{/tiene_participaciones}",
    "{#tiene_instrumentos}", R.doc_anexo7, "{/tiene_instrumentos}",
  ]);
  // Contrato y liquidaciones si trabaja; si no, cotizaciones
  const liq = buscar(buf, "Tres últimas liquidaciones de sueldo.");
  buf = cloneParagraphAfter(buf, liq.i, ["{/trabaja}", "{^trabaja}", R.doc_cotizaciones, "{/trabaja}"]);
  const con = buscar(buf, "Contrato de trabajo.");
  buf = setParagraphText(buf, con.i, "{#trabaja}");
  buf = cloneParagraphAfter(buf, con.i, [con.text]);

  // ---- Primer otrosí ----
  // Numeral 4: juicios
  const jui = buscar(buf, "La parte deudora declara que no tiene juicios pendientes");
  buf = desdoblar(buf, "La parte deudora declara que no tiene juicios pendientes", "tiene_juicios", [R.juicios_si, "{#juicios}", R.juicio, "{/juicios}"], [jui.text]);
  // Numeral 3: excluidos (el modelo remite al Anexo 8; ahora remite a los anexos donde haya bienes marcados como excluidos)
  const exc = buscar(buf, "La parte deudora no posee bienes legalmente excluidos");
  buf = setParagraphText(buf, exc.i, "{#tiene_excluidos}");
  buf = cloneParagraphAfter(buf, exc.i, [exc.text.replace("en el Anexo N.º 8", "en {anexos_excluidos}"), "{/tiene_excluidos}", "{^tiene_excluidos}", R.excluidos_no, "{/tiene_excluidos}"]);
  // Numeral 2: contrato (el modelo traía un caso con datos reales)
  buf = desdoblar(buf, "Copia de contrato de trabajo y 3 últimas liquidaciones", "trabaja", [R.contrato_si], [R.contrato_no]);
  // Numeral 2: documentos de dominio por categoría (el modelo solo traía la nota de los muebles)
  const dom = buscar(buf, "Otros bienes muebles y financieros: Respecto de los bienes singularizados");
  buf = setParagraphText(buf, dom.i, "{#tiene_bienes_raices}");
  buf = cloneParagraphAfter(buf, dom.i, [R.dominio_raices, "{/tiene_bienes_raices}", "{#tiene_vehiculos}", R.dominio_vehiculos, "{/tiene_vehiculos}", "{#tiene_bienes_muebles}", dom.text, "{/tiene_bienes_muebles}"]);
  // Numeral 1: una variante «sí» y una «no» por categoría
  const mue = buscar(buf, "Otros bienes muebles y financieros: La parte deudora declara");
  buf = desdoblar(buf, "Otros bienes muebles y financieros: La parte deudora declara", "tiene_bienes_muebles", [mue.text], [R.muebles_no]);
  const ins = buscar(buf, "Instrumentos financieros transables:");
  buf = desdoblar(buf, "Instrumentos financieros transables:", "tiene_instrumentos", [R.instrumentos_si], [ins.text]);
  const par = buscar(buf, "Derechos o acciones (participación)");
  buf = desdoblar(buf, "Derechos o acciones (participación)", "tiene_participaciones", [par.text], [R.participaciones_no]);
  const agu = buscar(buf, "Derechos de aprovechamiento de aguas y concesiones:");
  buf = desdoblar(buf, "Derechos de aprovechamiento de aguas y concesiones:", "tiene_aguas", [R.aguas_si], [agu.text]);
  const veh = buscar(buf, "Vehículos y otros bienes registrables: La parte deudora");
  buf = desdoblar(buf, "Vehículos y otros bienes registrables: La parte deudora", "tiene_vehiculos", [R.vehiculos_si], [veh.text]);
  const rai = buscar(buf, "Bienes raíces: La parte deudora");
  buf = desdoblar(buf, "Bienes raíces: La parte deudora", "tiene_bienes_raices", [R.raices_si], [rai.text]);

  const err = templateError(buf);
  if (err) throw new Error(`La Solicitud preparada no compila: ${err}`);
  return buf;
}

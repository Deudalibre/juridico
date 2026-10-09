// Preparación de los anexos Word de la Superintendencia para que la app los rellene: a partir del archivo
// original (en blanco, con «SI/NO» en las celdas) se escriben en la fila de datos los marcadores de
// docxtemplater, conservando tablas, estilos, pie y numeración. El Word preparado se sube como plantilla
// con su «slot». Solo servidor (usa pizzip/docxtemplater a través de docx.ts).
import { insertText, readDocx, removeTableRows, replaceText, setParagraphText, templateError, type Block, type Para, type Table } from "./docx";
import { prepararDemanda } from "./lvs-demanda";

/** Primer párrafo de cada celda de la fila `row` de la tabla número `tableIndex` (0 = primera tabla del documento). */
function cellParagraphs(blocks: Block[], tableIndex: number, row: number): Para[] {
  const tables = blocks.filter((b): b is Table => b.kind === "table");
  const t = tables[tableIndex];
  if (!t) throw new Error(`No existe la tabla ${tableIndex + 1} en el documento.`);
  const r = t.rows[row];
  if (!r) throw new Error(`La tabla ${tableIndex + 1} no tiene fila ${row + 1}.`);
  return r.map((cell, i) => {
    const p = cell.find((b): b is Para => b.kind === "p");
    if (!p) throw new Error(`La celda ${i + 1} de la fila ${row + 1} no tiene párrafo.`);
    return p;
  });
}

/**
 * Escribe `text` al final del párrafo o, si `replaceAll`, sustituye solo ese párrafo (nunca por texto en todo el
 * documento: los modelos repiten «SI/NO» en varias celdas de la misma fila y cada una lleva su marcador).
 */
function fill(buf: Buffer, p: Para, text: string, replaceAll = false): Buffer {
  if (replaceAll && p.text.length > 0) return setParagraphText(buf, p.i, text);
  return insertText(buf, p.i, p.text.length, text);
}

const ROTULO_FIRMA = "NOMBRE, RUT Y FIRMA DEUDOR O REPRESENTANTE";

/**
 * Pie de firma de los modelos oficiales: el rótulo «NOMBRE, RUT Y FIRMA DEUDOR O REPRESENTANTE» se sustituye por el
 * nombre del cliente y, en la línea siguiente, su RUT (mismo formato centrado). La línea de firma de arriba se conserva.
 */
function firmaDeudor(buf: Buffer): Buffer {
  const todos: Para[] = [];
  const visit = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "p") todos.push(b);
      else for (const row of b.rows) for (const cell of row) visit(cell);
    }
  };
  visit(readDocx(buf).blocks);
  const hits = todos.filter((p) => p.text.trim() === ROTULO_FIRMA);
  if (hits.length !== 1) throw new Error(`Se esperaba un pie «${ROTULO_FIRMA}» y hay ${hits.length}.`);
  // Nombre y, en la línea de abajo, solo el número de RUT (sin el rótulo «RUT»; pedido del estudio 2026-10-06): un solo
  // párrafo con el formato centrado del rótulo
  return setParagraphText(buf, hits[0].i, "{nombre_completo}\n{rut}");
}

/** Celdas del Anexo 8 en el orden del formulario oficial, con el marcador que recibe cada una. */
export const ANEXO8_COLUMNAS = ["tipo", "datos", "marca_modelo", "cantidad", "monto", "estado_conservacion", "direccion", "excluido", "gravamen", "observaciones"] as const;

/** Tabla del deudor de los anexos oficiales: dos filas (nombre, RUT) con la celda de la derecha en blanco. */
function fillDeudor(buf: Buffer): Buffer {
  const doc = readDocx(buf);
  const rut = cellParagraphs(doc.blocks, 0, 1)[1];
  const nombre = cellParagraphs(doc.blocks, 0, 0)[1];
  // De atrás hacia adelante: la celda del RUT va después de la del nombre
  buf = fill(buf, rut, "{rut}", rut.text.trim().length > 0);
  return fill(buf, nombre, "{nombre_completo}", nombre.text.trim().length > 0);
}

/** Deja una sola fila de datos en la tabla y la convierte en el bucle `{#lista}…{/lista}` con una marca por celda. */
function filaBucle(buf: Buffer, tableIndex: number, filasEnBlanco: number[], lista: string, columnas: readonly string[], etiqueta: string): Buffer {
  buf = removeTableRows(buf, tableIndex, filasEnBlanco);
  const doc = readDocx(buf);
  const cells = cellParagraphs(doc.blocks, tableIndex, 1);
  if (cells.length !== columnas.length) throw new Error(`${etiqueta} debería tener ${columnas.length} columnas y tiene ${cells.length}.`);
  // De atrás hacia adelante: las posiciones de los párrafos anteriores no cambian al editar los posteriores
  for (let i = cells.length - 1; i >= 0; i--) {
    const marker = (i === 0 ? `{#${lista}}` : "") + `{${columnas[i]}}` + (i === cells.length - 1 ? `{/${lista}}` : "");
    buf = fill(buf, cells[i], marker, cells[i].text.trim().length > 0); // «SI/NO» del modelo se sustituye
  }
  return buf;
}

/**
 * Anexo 8 oficial: tabla 1 = deudor; tabla 2 = cabecera y tres filas en blanco (la primera con «SI/NO» en
 * Bien excluido y Gravamen). Queda una fila como bucle {#bienes}…{/bienes}: docxtemplater la repite por cada bien.
 */
export function prepararAnexo8(original: Buffer): Buffer {
  let buf = filaBucle(original, 1, [2, 3], "bienes", ANEXO8_COLUMNAS, "El Anexo 8");
  buf = fillDeudor(buf);
  buf = firmaDeudor(buf);
  const err = templateError(buf);
  if (err) throw new Error(`El Anexo 8 preparado no compila: ${err}`);
  return buf;
}

/** Celdas de la fila de acreedores del Anexo 9, en el orden del formulario oficial. */
export const ANEXO9_COLUMNAS = ["rut", "acreedor", "monto", "correo", "telefono", "naturaleza"] as const;

/**
 * Anexo 9 oficial: tabla 1 = deudor; tabla 2 = cabecera, seis filas en blanco y la fila «Total» (4 celdas:
 * «Total» ocupa RUT y Acreedor, la siguiente es el monto). Queda una fila como bucle {#deudas}…{/deudas} y el
 * total calculado va en la celda del monto de la fila Total.
 */
export function prepararAnexo9(original: Buffer): Buffer {
  let buf = removeTableRows(original, 1, [2, 3, 4, 5, 6]);
  const doc = readDocx(buf);
  const totalRow = cellParagraphs(doc.blocks, 1, 2);
  if (totalRow.length < 2 || !/total/i.test(totalRow[0].text)) throw new Error("La fila Total del Anexo 9 no tiene la forma esperada.");
  buf = fill(buf, totalRow[1], "{total}", totalRow[1].text.trim().length > 0);
  buf = filaBucle(buf, 1, [], "deudas", ANEXO9_COLUMNAS, "El Anexo 9");
  buf = fillDeudor(buf);
  buf = firmaDeudor(buf);
  const err = templateError(buf);
  if (err) throw new Error(`El Anexo 9 preparado no compila: ${err}`);
  return buf;
}

/**
 * Anexo 11 oficial (declaración jurada del art. 273 A): los huecos entre corchetes del modelo pasan a ser las
 * variables de la ficha. Como la persona no es contribuyente de primera categoría, ese inciso del modelo se omite
 * (igual que en la versión que usaba el estudio) y «domiciliado» sigue el género. El resto del texto no se toca.
 */
export function prepararDeclaracion(original: Buffer): Buffer {
  let buf = original;
  for (const [de, a] of [
    // El modelo oficial titula «MODELO DE DECLARACIÓN JURADA…»; el documento del cliente es la declaración misma (2026-10-06)
    ["MODELO DE DECLARACIÓN JURADA", "DECLARACIÓN JURADA"],
    ["[nombre] [apellidos]", "{nombre_completo}"],
    ["[profesión u oficio]", "{profesion_oficio}"],
    ["[nacionalidad]", "{nacionalidad}"],
    ["[estado civil]", "{estado_civil}"],
    ["RUN: [RUN], contribuyente de primera categoría, RUT, domiciliado", "RUN: {rut}, {domiciliado_a}"],
    ["[dirección]", "{domicilio}"],
    // Tras la comuna va la región (pedido del estudio 2026-10-09): «Puente Alto, Metropolitana»
    ["[comuna]", "{comuna}, {region}"],
    ["los XX Anexos", "los {cantidad_anexos} Anexos"],
  ] as const) {
    const r = replaceText(buf, de, a);
    if (r.count !== 1) throw new Error(`En el Anexo 11 no se encontró «${de}» (apariciones: ${r.count}).`);
    buf = r.buf;
  }
  buf = firmaDeudor(buf);
  const err = templateError(buf);
  if (err) throw new Error(`La Declaración 273-A preparada no compila: ${err}`);
  return buf;
}

/* ---------- Anexos de bienes 3 a 7: mismas reglas, una lista por tabla ---------- */
export const ANEXO3_COLUMNAS = ["id", "descripcion", "direccion", "rol_avaluo", "numero_inscripcion", "fojas", "anio", "conservador", "avaluo_fiscal", "tipo", "hipoteca", "valor_comercial", "clase_propiedad", "excluido", "observaciones"] as const;
export const ANEXO4_COLUMNAS = ["id", "tipo", "descripcion", "patente", "numero_inscripcion", "marca", "modelo", "anio", "avaluo_fiscal", "tasacion", "estado", "gravamen", "excluido", "observaciones"] as const;
export const ANEXO5_AGUAS = ["numero_resolucion", "anio_resolucion", "entidad_emisora", "tipo_derecho", "naturaleza", "alveo", "rol_expediente", "conservador", "fojas", "anio", "gravamen", "excluido", "observaciones"] as const;
export const ANEXO5_CONCESIONES = ["acto", "numero", "anio", "servicio_emisor", "tipo", "numero_registro", "anio_registro", "gravamen", "excluido", "observaciones"] as const;
export const ANEXO6_ENTIDADES = ["titulo", "cantidad_porcentaje", "razon_social", "rut", "giro", "fecha_adquisicion", "valor", "gravamen", "excluido", "observaciones"] as const;
export const ANEXO6_HERENCIAS = ["titulo", "cantidad_porcentaje", "causante", "resolucion_exenta", "inscripcion_rnt", "fecha_adquisicion", "valorizacion", "gravamen", "excluido", "observaciones"] as const;
export const ANEXO7_COLUMNAS = ["titulo", "emisor", "fecha_adquisicion", "cantidad", "moneda", "valor", "excluido", "gravamen", "observaciones"] as const;

type TablaBucle = { index: number; filasEnBlanco: number[]; lista: string; columnas: readonly string[] };

/**
 * Anexos oficiales de bienes: tabla 1 = deudor; después una tabla por lista (el 5 y el 6 traen dos). Cada tabla
 * queda con cabecera y una fila que es el bucle de su lista. Se procesan de la última tabla a la primera.
 */
function prepararAnexoBienes(etiqueta: string, tablas: TablaBucle[]) {
  return (original: Buffer): Buffer => {
    let buf = original;
    for (const t of [...tablas].sort((a, b) => b.index - a.index)) buf = filaBucle(buf, t.index, t.filasEnBlanco, t.lista, t.columnas, `${etiqueta} (tabla ${t.index + 1})`);
    buf = fillDeudor(buf);
    buf = firmaDeudor(buf);
    const err = templateError(buf);
    if (err) throw new Error(`${etiqueta} preparado no compila: ${err}`);
    return buf;
  };
}

export const prepararAnexo3 = prepararAnexoBienes("El Anexo 3", [{ index: 1, filasEnBlanco: [2, 3, 4], lista: "raices", columnas: ANEXO3_COLUMNAS }]);
export const prepararAnexo4 = prepararAnexoBienes("El Anexo 4", [{ index: 1, filasEnBlanco: [2, 3], lista: "vehiculos", columnas: ANEXO4_COLUMNAS }]);
export const prepararAnexo5 = prepararAnexoBienes("El Anexo 5", [
  { index: 1, filasEnBlanco: [2, 3, 4, 5], lista: "aguas", columnas: ANEXO5_AGUAS },
  { index: 2, filasEnBlanco: [2, 3, 4, 5], lista: "concesiones", columnas: ANEXO5_CONCESIONES },
]);
export const prepararAnexo6 = prepararAnexoBienes("El Anexo 6", [
  { index: 1, filasEnBlanco: [2, 3], lista: "entidades", columnas: ANEXO6_ENTIDADES },
  { index: 2, filasEnBlanco: [2, 3, 4], lista: "herencias", columnas: ANEXO6_HERENCIAS },
]);
export const prepararAnexo7 = prepararAnexoBienes("El Anexo 7", [{ index: 1, filasEnBlanco: [2, 3, 4], lista: "valores", columnas: ANEXO7_COLUMNAS }]);

export const PREPARADORES: Record<string, { nombre: string; archivo: string; preparar: (buf: Buffer) => Buffer; variables: string[] }> = {
  anexo3: { nombre: "Anexo N.º 3 · Nómina de bienes raíces", archivo: "Anexo3.docx", preparar: prepararAnexo3, variables: ["nombre_completo", "rut", "raices"] },
  anexo4: { nombre: "Anexo N.º 4 · Nómina de vehículos motorizados y otros bienes registrables", archivo: "Anexo4.docx", preparar: prepararAnexo4, variables: ["nombre_completo", "rut", "vehiculos"] },
  anexo5: { nombre: "Anexo N.º 5 · Nómina de derechos de aprovechamiento de aguas y concesiones", archivo: "Anexo5.docx", preparar: prepararAnexo5, variables: ["nombre_completo", "rut", "aguas", "concesiones"] },
  anexo6: { nombre: "Anexo N.º 6 · Nómina de derechos o acciones en entidades y comunidades hereditarias", archivo: "Anexo6.docx", preparar: prepararAnexo6, variables: ["nombre_completo", "rut", "entidades", "herencias"] },
  anexo7: { nombre: "Anexo N.º 7 · Nómina de valores (instrumentos financieros transables)", archivo: "Anexo7.docx", preparar: prepararAnexo7, variables: ["nombre_completo", "rut", "valores"] },
  anexo8: {
    nombre: "Anexo N.º 8 · Nómina de otros bienes muebles y financieros",
    archivo: "Anexo8.docx",
    preparar: prepararAnexo8,
    variables: ["nombre_completo", "rut", "bienes"],
  },
  anexo9: {
    nombre: "Anexo N.º 9 · Nómina de acreedores",
    archivo: "Anexo9.docx",
    preparar: prepararAnexo9,
    variables: ["nombre_completo", "rut", "deudas", "total"],
  },
  demanda_lvs: {
    nombre: "Solicitud de liquidación voluntaria simplificada",
    archivo: "Solicitud - LVS - Modelo.docx",
    preparar: prepararDemanda,
    variables: ["nombre_completo", "rut", "nacionalidad", "estado_civil", "profesion_oficio", "domiciliado_a", "domicilio", "comuna", "region", "sj_comuna", "carta_de_insolvencia", "don_dona", "el_la_solicitante", "empleador", "anexos_excluidos", "juicios", "raices", "vehiculos"],
  },
  declaracion_273a: {
    nombre: "Declaración jurada 273 A · antecedentes completos y fehacientes (Anexo N.º 11)",
    archivo: "Anexo11.docx",
    preparar: prepararDeclaracion,
    variables: ["nombre_completo", "profesion_oficio", "nacionalidad", "estado_civil", "rut", "domiciliado_a", "domicilio", "comuna", "region", "cantidad_anexos"],
  },
};

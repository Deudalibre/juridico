// Preparación de los anexos Word de la Superintendencia para que la app los rellene: a partir del archivo
// original (en blanco, con «SI/NO» en las celdas) se escriben en la fila de datos los marcadores de
// docxtemplater, conservando tablas, estilos, pie y numeración. El Word preparado se sube como plantilla
// con su «slot». Solo servidor (usa pizzip/docxtemplater a través de docx.ts).
import { insertText, readDocx, removeTableRows, replaceText, templateError, type Block, type Para, type Table } from "./docx";

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

/** Escribe `text` al final del párrafo (o lo sustituye entero si `replaceAll`). */
function fill(buf: Buffer, p: Para, text: string, replaceAll = false): Buffer {
  if (replaceAll && p.text.length > 0) return replaceText(buf, p.text, text).buf;
  return insertText(buf, p.i, p.text.length, text);
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
    ["[nombre] [apellidos]", "{nombre_completo}"],
    ["[profesión u oficio]", "{profesion_oficio}"],
    ["[nacionalidad]", "{nacionalidad}"],
    ["[estado civil]", "{estado_civil}"],
    ["RUN: [RUN], contribuyente de primera categoría, RUT, domiciliado", "RUN: {rut}, {domiciliado_a}"],
    ["[dirección]", "{domicilio}"],
    ["[comuna]", "{comuna}"],
    ["los XX Anexos", "los {cantidad_anexos} Anexos"],
  ] as const) {
    const r = replaceText(buf, de, a);
    if (r.count !== 1) throw new Error(`En el Anexo 11 no se encontró «${de}» (apariciones: ${r.count}).`);
    buf = r.buf;
  }
  const err = templateError(buf);
  if (err) throw new Error(`La Declaración 273-A preparada no compila: ${err}`);
  return buf;
}

export const PREPARADORES: Record<string, { nombre: string; archivo: string; preparar: (buf: Buffer) => Buffer; variables: string[] }> = {
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
  declaracion_273a: {
    nombre: "Declaración jurada 273 A · antecedentes completos y fehacientes (Anexo N.º 11)",
    archivo: "Anexo11.docx",
    preparar: prepararDeclaracion,
    variables: ["nombre_completo", "profesion_oficio", "nacionalidad", "estado_civil", "rut", "domiciliado_a", "domicilio", "comuna", "cantidad_anexos"],
  },
};

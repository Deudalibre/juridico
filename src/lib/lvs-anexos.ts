// Preparación de los anexos Word de la Superintendencia para que la app los rellene: a partir del archivo
// original (en blanco, con «SI/NO» en las celdas) se escriben en la fila de datos los marcadores de
// docxtemplater, conservando tablas, estilos, pie y numeración. El Word preparado se sube como plantilla
// con su «slot». Solo servidor (usa pizzip/docxtemplater a través de docx.ts).
import { insertText, readDocx, replaceText, setParagraphText, templateError, type Block, type Para, type Table } from "./docx";

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

/**
 * Anexo 8: tabla 1 = deudor (ya trae {nombre_completo} y {rut}); tabla 2 = cabecera + una fila de datos.
 * La fila de datos pasa a ser un bucle {#bienes}…{/bienes}: docxtemplater la repite por cada bien.
 */
export function prepararAnexo8(original: Buffer): Buffer {
  let buf = original;
  const doc = readDocx(buf);
  const cells = cellParagraphs(doc.blocks, 1, 1);
  if (cells.length !== ANEXO8_COLUMNAS.length) throw new Error(`El Anexo 8 debería tener ${ANEXO8_COLUMNAS.length} columnas y tiene ${cells.length}.`);
  // De atrás hacia adelante: las posiciones de los párrafos anteriores no cambian al editar los posteriores
  for (let i = cells.length - 1; i >= 0; i--) {
    const col = ANEXO8_COLUMNAS[i];
    const marker = (i === 0 ? "{#bienes}" : "") + `{${col}}` + (i === cells.length - 1 ? "{/bienes}" : "");
    const p = cells[i];
    buf = fill(buf, p, marker, p.text.trim().length > 0); // la celda «Dirección» traía {domicilio}: se sustituye
  }
  const err = templateError(buf);
  if (err) throw new Error(`El Anexo 8 preparado no compila: ${err}`);
  return buf;
}

/**
 * Declaración jurada 273 A (Anexo 11 del estudio): ya trae las variables escritas en el Word. Solo se normalizan
 * los nombres con tilde (el catálogo no los admite) y se separa «{domicilio}{comuna}», que venía pegado.
 * El texto jurídico no se toca.
 */
export function prepararDeclaracion(original: Buffer): Buffer {
  let buf = original;
  for (const [de, a] of [
    ["{profesión_oficio}", "{profesion_oficio}"],
    ["{región}", "{region}"],
    ["{domicilio}{comuna}", "{domicilio}, {comuna}"],
  ] as const) {
    buf = replaceText(buf, de, a).buf;
  }
  // El modelo traía un párrafo con un punto suelto después de la individualización: queda en blanco
  const doc = readDocx(buf);
  const suelto = doc.blocks.find((b): b is Para => b.kind === "p" && b.text.trim() === ".");
  if (suelto) buf = setParagraphText(buf, suelto.i, "");
  const err = templateError(buf);
  if (err) throw new Error(`La Declaración 273-A preparada no compila: ${err}`);
  return buf;
}

export const PREPARADORES: Record<string, { nombre: string; archivo: string; preparar: (buf: Buffer) => Buffer; variables: string[] }> = {
  declaracion_273a: {
    nombre: "Declaración jurada 273 A · antecedentes completos y fehacientes (Anexo N.º 11)",
    archivo: "11.- Declaracion 273-A.docx",
    preparar: prepararDeclaracion,
    variables: ["nombre_completo", "profesion_oficio", "nacionalidad", "estado_civil", "rut", "domiciliado_a", "domicilio", "comuna", "region"],
  },
  anexo8: {
    nombre: "Anexo N.º 8 · Nómina de otros bienes muebles y financieros",
    archivo: "9.- ANEXO 8.docx",
    preparar: prepararAnexo8,
    variables: ["nombre_completo", "rut", "bienes"],
  },
};

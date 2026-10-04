// Lectura y marcado de plantillas Word (.docx) sin perder el formato.
//
// Un .docx es un ZIP con word/document.xml. Aquí se trabaja sobre ese XML como texto, por párrafo:
// se extraen los «runs» (tramos con el mismo formato) y su texto, y para marcar una variable se
// reemplaza el tramo elegido por un run nuevo que hereda el formato del primer run tocado.
// Solo se usa desde el servidor (pizzip + docxtemplater).
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export type Run = { s: number; e: number; b?: true; i?: true; u?: true };
export type Para = { kind: "p"; i: number; text: string; runs: Run[]; align?: "center" | "right" | "both"; heading?: true };
export type Table = { kind: "table"; rows: Block[][][] }; // filas → celdas → bloques
export type Block = Para | Table;
export type DocModel = { blocks: Block[]; paragraphs: number };

const DOC_PATH = "word/document.xml";

const unescapeXml = (s: string) =>
  s.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, (_, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });
const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ---------- Estructura del documento ---------- */

type RawPara = { open: number; contentStart: number; contentEnd: number; selfClosing: boolean };

// Tokens estructurales: tablas, filas, celdas y párrafos. Los lookaheads evitan confundir <w:p con <w:pPr, <w:tbl con <w:tblPr, etc.
const TOKEN = /<w:(tbl|tr|tc|p)(?=[\s/>])[^>]*?(\/?)>|<\/w:(tbl|tr|tc|p)>/g;

function walk(xml: string, onPara: (p: RawPara, container: Block[]) => void): Block[] {
  const root: Block[] = [];
  const containers: Block[][] = [root];
  const tables: Table[] = [];
  let depth = 0; // profundidad de párrafo (los cuadros de texto anidan párrafos dentro de párrafos)
  let open: RawPara | null = null;
  for (const m of xml.matchAll(TOKEN)) {
    const [tok, openTag, selfClose, closeTag] = m;
    const at = m.index!;
    if (openTag === "p") {
      if (selfClose) {
        if (depth === 0) onPara({ open: at, contentStart: at + tok.length, contentEnd: at + tok.length, selfClosing: true }, containers[containers.length - 1]);
        continue;
      }
      depth++;
      if (depth === 1) open = { open: at, contentStart: at + tok.length, contentEnd: -1, selfClosing: false };
      continue;
    }
    if (closeTag === "p") {
      depth--;
      if (depth === 0 && open) {
        open.contentEnd = at;
        onPara(open, containers[containers.length - 1]);
        open = null;
      }
      continue;
    }
    if (depth > 0) continue; // tablas dentro de cuadros de texto: se ignoran
    if (openTag === "tbl") {
      const t: Table = { kind: "table", rows: [] };
      containers[containers.length - 1].push(t);
      tables.push(t);
    } else if (closeTag === "tbl") tables.pop();
    else if (openTag === "tr") tables[tables.length - 1]?.rows.push([]);
    else if (openTag === "tc") {
      const rows = tables[tables.length - 1]?.rows;
      const cell: Block[] = [];
      rows?.[rows.length - 1]?.push(cell);
      containers.push(cell);
    } else if (closeTag === "tc") containers.pop();
  }
  return root;
}

/* ---------- Runs y texto ---------- */

type RawRun = { xs: number; xe: number; rPr: string; text: string; opaque: boolean; s: number; e: number; b?: true; i?: true; u?: true };

const OPAQUE_BLOCKS = /<(w:drawing|w:pict|mc:AlternateContent|w:object)(?=[\s>])[\s\S]*?<\/\1>/g;
const RUN = /<w:r(?=[\s>])[^>]*>([\s\S]*?)<\/w:r>/g;
const RUN_TOKEN = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:t(?:\s[^>]*)?\/>|<w:tab\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\/>|<w:noBreakHyphen\/>|<w:softHyphen\/>|<w:lastRenderedPageBreak\/>|<w:rPr>[\s\S]*?<\/w:rPr>/g;

const flag = (rPr: string, tag: string) => {
  const m = rPr.match(new RegExp(`<w:${tag}(?:\\s[^>]*)?/>`));
  if (!m) return false;
  const val = m[0].match(/w:val="([^"]*)"/)?.[1];
  return !(val === "0" || val === "false" || val === "none");
};

/** Runs de un párrafo (contenido crudo entre <w:p> y </w:p>) con su texto y posiciones. */
function runsOf(content: string): RawRun[] {
  // Los dibujos y cuadros de texto llevan runs anidados: se «tapan» para que el regex de runs no entre en ellos
  const masked = content.replace(OPAQUE_BLOCKS, (b) => " ".repeat(b.length));
  const out: RawRun[] = [];
  let pos = 0;
  for (const m of masked.matchAll(RUN)) {
    const inner = m[1];
    const rPr = inner.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    let text = "";
    let rest = inner;
    for (const t of inner.matchAll(RUN_TOKEN)) {
      const tok = t[0];
      if (tok.startsWith("<w:t>") || tok.startsWith("<w:t ")) text += tok.endsWith("/>") ? "" : unescapeXml(t[1] ?? "");
      else if (tok === "<w:tab/>") text += "\t";
      else if (tok.startsWith("<w:br") || tok === "<w:cr/>") text += "\n";
      else if (tok === "<w:noBreakHyphen/>") text += "-";
      rest = rest.replace(tok, "");
    }
    const opaque = rest.trim().length > 0; // campos, notas, imágenes: no se tocan
    const r: RawRun = { xs: m.index!, xe: m.index! + m[0].length, rPr, text, opaque, s: pos, e: pos + text.length };
    if (flag(rPr, "b")) r.b = true;
    if (flag(rPr, "i")) r.i = true;
    if (flag(rPr, "u")) r.u = true;
    out.push(r);
    pos += text.length;
  }
  return out;
}

function toPara(index: number, content: string): Para {
  const runs = runsOf(content);
  const p: Para = { kind: "p", i: index, text: runs.map((r) => r.text).join(""), runs: [] };
  for (const r of runs) {
    if (r.e === r.s) continue;
    const run: Run = { s: r.s, e: r.e };
    if (r.b) run.b = true;
    if (r.i) run.i = true;
    if (r.u) run.u = true;
    p.runs.push(run);
  }
  const pPr = content.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
  const jc = pPr.match(/<w:jc w:val="([^"]+)"/)?.[1];
  if (jc === "center" || jc === "right" || jc === "both") p.align = jc;
  const style = pPr.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
  if (/heading|t.tulo|title/i.test(style)) p.heading = true;
  return p;
}

/* ---------- API ---------- */

function open(buf: Uint8Array) {
  const zip = new PizZip(buf);
  const file = zip.file(DOC_PATH);
  if (!file) throw new Error("El archivo no es un documento Word (.docx) válido.");
  return { zip, xml: file.asText() };
}

/** Modelo del documento para el editor: párrafos con texto, formato básico y tablas. */
export function readDocx(buf: Uint8Array): DocModel {
  const { xml } = open(buf);
  let n = 0;
  const blocks = walk(xml, (raw, container) => {
    container.push(toPara(n++, raw.selfClosing ? "" : xml.slice(raw.contentStart, raw.contentEnd)));
  });
  return { blocks, paragraphs: n };
}

/** Texto plano de todos los párrafos (para contar marcadores). */
export function docText(doc: DocModel): string {
  const out: string[] = [];
  const visit = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "p") out.push(b.text);
      else for (const row of b.rows) for (const cell of row) visit(cell);
    }
  };
  visit(doc.blocks);
  return out.join("\n");
}

function runXml(rPr: string, text: string) {
  const parts = text.split(/(\t|\n)/).filter((x) => x !== "");
  const body = parts.map((x) => (x === "\t" ? "<w:tab/>" : x === "\n" ? "<w:br/>" : `<w:t xml:space="preserve">${escapeXml(x)}</w:t>`)).join("");
  return `<w:r>${rPr}${body}</w:r>`;
}

const BETWEEN_OK = /<w:proofErr[^>]*\/>|<w:bookmark(Start|End)[^>]*\/>|\s/g;

/** Reemplaza el texto [start, end) del párrafo `index` por `replacement`, conservando el formato del tramo. */
function replaceInXml(xml: string, index: number, start: number, end: number, replacement: string): string {
  let target: RawPara | null = null;
  let n = 0;
  walk(xml, (raw) => {
    if (n++ === index) target = raw;
  });
  if (!target) throw new Error("Párrafo no encontrado.");
  const t = target as RawPara;
  if (t.selfClosing) throw new Error("El párrafo está vacío.");
  const content = xml.slice(t.contentStart, t.contentEnd);
  const runs = runsOf(content);
  const total = runs.length ? runs[runs.length - 1].e : 0;
  if (!(start >= 0 && end > start && end <= total)) throw new Error("La selección no coincide con el texto del párrafo.");
  const hit = runs.filter((r) => r.e > r.s && r.s < end && r.e > start);
  if (hit.length === 0) throw new Error("La selección no contiene texto.");
  if (hit.some((r) => r.opaque)) throw new Error("La selección incluye un campo, nota o imagen de Word: elige solo texto.");
  const first = hit[0];
  const last = hit[hit.length - 1];
  const between = content.slice(first.xe, last.xs);
  // Entre el primer y el último run solo puede haber otros runs, marcas de corrección o marcadores de Word
  const leftover = between.replace(RUN, "").replace(BETWEEN_OK, "");
  if (leftover.length > 0) throw new Error("La selección cruza un enlace o un campo de Word: elige un tramo más corto.");
  const prefix = first.text.slice(0, start - first.s);
  const suffix = last.text.slice(end - last.s);
  const fresh = (prefix ? runXml(first.rPr, prefix) : "") + runXml(first.rPr, replacement) + (suffix ? runXml(last.rPr, suffix) : "");
  const newContent = content.slice(0, first.xs) + fresh + content.slice(last.xe);
  return xml.slice(0, t.contentStart) + newContent + xml.slice(t.contentEnd);
}

function save(zip: PizZip, xml: string): Buffer {
  zip.file(DOC_PATH, xml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/** Marca como variable el tramo [start, end) del párrafo `index`: el texto pasa a ser {name}. */
export function markVariable(buf: Uint8Array, index: number, start: number, end: number, name: string): Buffer {
  const { zip, xml } = open(buf);
  return save(zip, replaceInXml(xml, index, start, end, `{${name}}`));
}

/**
 * Inserta `text` en la posición `pos` (en caracteres) del párrafo `index`, como run nuevo que hereda el formato
 * del tramo donde cae (o el de la marca de párrafo si el párrafo está vacío). Sirve para poner una variable
 * en un punto sin texto: una celda vacía, el final de una línea, entre dos palabras.
 */
function insertInXml(xml: string, index: number, pos: number, text: string): string {
  let target: RawPara | null = null;
  let n = 0;
  walk(xml, (raw) => {
    if (n++ === index) target = raw;
  });
  if (!target) throw new Error("Párrafo no encontrado.");
  const t = target as RawPara;
  if (t.selfClosing) {
    // <w:p/> → <w:p>…run…</w:p>
    const openTag = xml.slice(t.open, t.contentStart).replace(/\/>$/, ">");
    return xml.slice(0, t.open) + openTag + runXml("", text) + "</w:p>" + xml.slice(t.contentStart);
  }
  const content = xml.slice(t.contentStart, t.contentEnd);
  const runs = runsOf(content);
  const textRuns = runs.filter((r) => r.e > r.s);
  const total = runs.length ? runs[runs.length - 1].e : 0;
  if (!(pos >= 0 && pos <= total)) throw new Error("La posición no coincide con el texto del párrafo.");
  let fresh: string;
  let cut: [number, number];
  if (textRuns.length === 0) {
    // Párrafo sin texto: el formato lo dicta la marca de párrafo (<w:pPr><w:rPr/>), y el run va después del pPr
    const pPr = content.match(/^\s*<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? "";
    const rPr = pPr.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    fresh = runXml(rPr, text);
    cut = [pPr.length, pPr.length];
  } else {
    // Run donde cae la posición: el que la contiene estrictamente; en un borde, el run anterior (o el primero)
    const inside = textRuns.find((r) => r.s < pos && pos < r.e);
    if (inside) {
      if (inside.opaque) throw new Error("Ahí hay un campo, nota o imagen de Word: elige otro punto.");
      const prefix = inside.text.slice(0, pos - inside.s);
      const suffix = inside.text.slice(pos - inside.s);
      fresh = runXml(inside.rPr, prefix) + runXml(inside.rPr, text) + runXml(inside.rPr, suffix);
      cut = [inside.xs, inside.xe];
    } else {
      const before = [...textRuns].reverse().find((r) => r.e <= pos);
      const after = textRuns.find((r) => r.s >= pos);
      const ref = before ?? after!;
      fresh = runXml(ref.rPr, text);
      cut = before ? [before.xe, before.xe] : [after!.xs, after!.xs];
    }
  }
  const newContent = content.slice(0, cut[0]) + fresh + content.slice(cut[1]);
  return xml.slice(0, t.contentStart) + newContent + xml.slice(t.contentEnd);
}

/** Sustituye todo el texto del párrafo `index` por `text` (vacío = párrafo en blanco), conservando su formato. */
export function setParagraphText(buf: Uint8Array, index: number, text: string): Buffer {
  const { zip, xml } = open(buf);
  const doc = readDocx(buf);
  let target: Para | null = null;
  const visit = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "p") {
        if (b.i === index) target = b;
      } else for (const row of b.rows) for (const cell of row) visit(cell);
    }
  };
  visit(doc.blocks);
  if (!target) throw new Error("Párrafo no encontrado.");
  const len = (target as Para).text.length;
  if (len === 0) return save(zip, xml);
  return save(zip, replaceInXml(xml, index, 0, len, text));
}

/** Inserta un texto cualquiera (p. ej. marcas de bucle {#x}…{/x}) en la posición `pos` del párrafo `index`. */
export function insertText(buf: Uint8Array, index: number, pos: number, text: string): Buffer {
  const { zip, xml } = open(buf);
  return save(zip, insertInXml(xml, index, pos, text));
}

/** Inserta la variable {name} en la posición `pos` del párrafo `index` (sin reemplazar texto). */
export function insertVariable(buf: Uint8Array, index: number, pos: number, name: string): Buffer {
  const { zip, xml } = open(buf);
  return save(zip, insertInXml(xml, index, pos, `{${name}}`));
}

/** Sustituye todas las apariciones de {name} por `replacement` (texto llano o {otro_nombre}). Devuelve cuántas cambió. */
export function replaceVariable(buf: Uint8Array, name: string, replacement: string): { buf: Buffer; count: number } {
  return replaceText(buf, `{${name}}`, replacement);
}

/**
 * Sustituye todas las apariciones exactas de un texto (aunque Word lo tenga partido en varios runs) conservando
 * el formato del tramo. Sirve para convertir palabras fijas del modelo («don», «domiciliado») en marcadores.
 */
export function replaceText(buf: Uint8Array, tag: string, replacement: string): { buf: Buffer; count: number } {
  const { zip } = open(buf);
  let xml = open(buf).xml;
  let count = 0;
  // Se recorre de atrás hacia adelante para que las posiciones anteriores no se muevan
  const paras: { index: number; text: string }[] = [];
  let n = 0;
  walk(xml, (raw) => {
    const content = raw.selfClosing ? "" : xml.slice(raw.contentStart, raw.contentEnd);
    paras.push({ index: n++, text: runsOf(content).map((r) => r.text).join("") });
  });
  for (const p of paras.reverse()) {
    let at = p.text.lastIndexOf(tag);
    while (at >= 0) {
      xml = replaceInXml(xml, p.index, at, at + tag.length, replacement);
      count++;
      at = at > 0 ? p.text.lastIndexOf(tag, at - 1) : -1;
    }
  }
  return { buf: save(zip, xml), count };
}

/** Comprueba que docxtemplater pueda compilar la plantilla (llaves balanceadas). null si está bien. */
export function templateError(buf: Uint8Array): string | null {
  try {
    new Docxtemplater(new PizZip(buf), { paragraphLoop: true, linebreaks: true });
    return null;
  } catch (e) {
    const err = e as { properties?: { errors?: { properties?: { explanation?: string } }[] }; message?: string };
    const first = err.properties?.errors?.[0]?.properties?.explanation;
    return first ?? err.message ?? "La plantilla tiene un error.";
  }
}

/* ============================================================
   Datos uniformes: todo lo que la app rellena sale con la misma letra (Verdana) y en MAYÚSCULAS, en todos los
   documentos, sin tocar el texto fijo de la plantilla. Se hace al generar, así vale también para las plantillas
   que el usuario escribió a mano en Word.
   ============================================================ */
export const FUENTE_DATOS = "Verdana";

/** Mayúsculas en todos los textos del dato (también dentro de listas y objetos: las filas de los anexos). */
export function enMayusculas<T>(v: T, excepto?: Set<string>): T {
  if (typeof v === "string") return v.toLocaleUpperCase("es-CL") as T;
  if (Array.isArray(v)) return v.map((x) => enMayusculas(x, excepto)) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, excepto?.has(k) ? x : enMayusculas(x, excepto)])) as T;
  return v;
}

/** rPr con la fuente de datos en los cuatro huecos (y sin fuentes de tema, que mandarían sobre la explícita). */
function conFuente(rPr: string, font: string): string {
  const fonts = `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>`;
  if (!rPr) return `<w:rPr>${fonts}</w:rPr>`;
  const sin = rPr.replace(/<w:rFonts[^>]*\/>/g, "").replace(/<w:rFonts[^>]*>[\s\S]*?<\/w:rFonts>/g, "");
  const style = sin.match(/<w:rStyle[^>]*\/>/)?.[0];
  return style ? sin.replace(style, style + fonts) : sin.replace("<w:rPr>", `<w:rPr>${fonts}`);
}

/** Trozos de un run: los que son (parte de) una variable {…} llevan la fuente de datos; el resto queda igual. */
function trozos(text: string): { t: string; tag: boolean }[] {
  const out: { t: string; tag: boolean }[] = [];
  let i = 0;
  // Un «}» antes de cualquier «{» cierra una variable que empezó en el run anterior
  const close = text.indexOf("}");
  const open = text.indexOf("{");
  if (close >= 0 && (open < 0 || close < open)) {
    out.push({ t: text.slice(0, close + 1), tag: true });
    i = close + 1;
  }
  while (i < text.length) {
    const a = text.indexOf("{", i);
    if (a < 0) {
      out.push({ t: text.slice(i), tag: false });
      break;
    }
    if (a > i) out.push({ t: text.slice(i, a), tag: false });
    const b = text.indexOf("}", a);
    const end = b < 0 ? text.length : b + 1;
    out.push({ t: text.slice(a, end), tag: true });
    i = end;
  }
  return out;
}

const SOLO_TEXTO = /^(?:<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:t(?:\s[^>]*)?\/>)+$/;

/**
 * Separa cada variable en su propio run con la fuente de datos. Solo se tocan runs de texto llano (sin campos,
 * notas ni dibujos); una variable partida entre runs también queda cubierta (docxtemplater la arma en el primero).
 */
export function uniformarVariables(xml: string, font = FUENTE_DATOS, excepto?: Set<string>): string {
  const masked = xml.replace(OPAQUE_BLOCKS, (b) => " ".repeat(b.length));
  let out = "";
  let last = 0;
  for (const m of masked.matchAll(RUN)) {
    const inner = m[1];
    const rPr = inner.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? "";
    const body = inner.replace(rPr, "");
    if (!SOLO_TEXTO.test(body) || !/[{}]/.test(body)) continue;
    const text = Array.from(body.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g), (t) => unescapeXml(t[1])).join("");
    const nuevo = trozos(text)
      .map((p) => runXml(p.tag && !excepto?.has(p.t.replace(/[{}]/g, "").trim()) ? conFuente(rPr, font) : rPr, p.t))
      .join("");
    out += xml.slice(last, m.index!) + nuevo;
    last = m.index! + m[0].length;
  }
  return out + xml.slice(last);
}

/**
 * Genera el documento final con los valores dados (las variables sin valor quedan vacías).
 * Los datos salen uniformes: fuente de datos y mayúsculas, en todos los documentos. `textoFijo` nombra las
 * variables que son redacción de la plantilla y no datos (p. ej. don/doña): conservan su letra y minúsculas.
 */
export function renderDocx(buf: Uint8Array, data: Record<string, unknown>, opciones: { textoFijo?: string[] } = {}): Buffer {
  const excepto = new Set(opciones.textoFijo ?? []);
  const zip = new PizZip(buf);
  const file = zip.file(DOC_PATH);
  if (file) zip.file(DOC_PATH, uniformarVariables(file.asText(), FUENTE_DATOS, excepto));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "" });
  doc.render(enMayusculas(data, excepto));
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/**
 * Quita filas de una tabla (índices desde 0, tabla `tableIndex` contando solo las de primer nivel). Sirve para
 * dejar una sola fila de datos en los anexos oficiales, que vienen con varias en blanco: esa fila se convierte en
 * el bucle que docxtemplater repite por cada elemento.
 */
export function removeTableRows(buf: Uint8Array, tableIndex: number, rows: number[]): Buffer {
  const { zip, xml } = open(buf);
  const quitar = new Set(rows);
  const cortes: [number, number][] = [];
  let tbl = 0; // profundidad de tabla
  let nTabla = -1;
  let fila = -1;
  let filaOpen = -1;
  for (const m of xml.matchAll(/<w:(tbl|tr)(?=[\s/>])[^>]*?>|<\/w:(tbl|tr)>/g)) {
    const [tok, openTag, closeTag] = m;
    const at = m.index!;
    if (openTag === "tbl") {
      tbl++;
      if (tbl === 1) {
        nTabla++;
        fila = -1;
      }
    } else if (closeTag === "tbl") tbl--;
    else if (tbl === 1 && nTabla === tableIndex) {
      if (openTag === "tr") {
        fila++;
        filaOpen = at;
      } else if (closeTag === "tr" && quitar.has(fila)) cortes.push([filaOpen, at + tok.length]);
    }
  }
  if (nTabla < tableIndex) throw new Error(`No existe la tabla ${tableIndex + 1} en el documento.`);
  if (cortes.length !== quitar.size) throw new Error(`La tabla ${tableIndex + 1} no tiene las filas ${rows.map((r) => r + 1).join(", ")}.`);
  let out = xml;
  for (const [a, b] of cortes.reverse()) out = out.slice(0, a) + out.slice(b);
  return save(zip, out);
}

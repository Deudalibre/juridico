// Construye un .docx mínimo pero realista para las pruebas (varios runs por párrafo, negrita, tabulador,
// tabla, párrafo vacío y una variable ya escrita en Word). Devuelve un Buffer.
import PizZip from "pizzip";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r = (text, rPr = "") => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
const p = (inner, pPr = "") => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${inner}</w:p>`;

export function sampleDocx({ withTag = true } = {}) {
  const body = [
    p(r("DECLARACIÓN JURADA", "<w:b/>"), '<w:pStyle w:val="Title"/><w:jc w:val="center"/>'),
    // «Nombre Completo» partido en tres runs, como suele dejarlo Word; la parte central en negrita
    p(r("Yo, ") + r("Nombre ", "<w:b/>") + r("Completo", "<w:b/><w:i/>") + r(", cédula de identidad N° ") + r(withTag ? "{rut}" : "12.345.678-5") + r(", domiciliado en Calle Falsa 123, comuna de Santiago, declaro bajo juramento:")),
    p(r("Deudas:") + "<w:r><w:tab/></w:r>" + r("$ 4.500.000 & intereses")),
    `<w:tbl><w:tblPr/><w:tblGrid/><w:tr><w:tc><w:tcPr/>${p(r("Acreedor", "<w:b/>"))}</w:tc><w:tc><w:tcPr/>${p(r("Monto", "<w:b/>"))}</w:tc></w:tr><w:tr><w:tc><w:tcPr/>${p(r("Banco Ejemplo"))}</w:tc><w:tc><w:tcPr/>${p(r("$ 1.000.000"))}</w:tc></w:tr></w:tbl>`,
    "<w:p/>",
    p(r("Firmado en Santiago, a ") + r("12 de septiembre de 2026") + r("."), '<w:jc w:val="right"/>'),
    "<w:sectPr/>",
  ].join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  zip.file("word/document.xml", document);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

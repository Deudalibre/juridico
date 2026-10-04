// Documentos que lleva la carpeta de una solicitud LVS: la lista que el estudio arma para cada cliente, calculada
// desde la Ficha Maestra y los bienes cargados. No se marca nada a mano: el archivo real vive en la carpeta del
// cliente en Drive y, si está conectada, cada documento se cruza por nombre con los archivos que ya hay.
// Sin dependencias de servidor.
import type { LvsFicha } from "./lvs";
import { CATEGORIAS, type BienesPorCategoria, type BienRow } from "./lvs-bienes";

export type DocumentoCarpeta = {
  n: number;
  nombre: string;
  /** Por qué va en esta carpeta (vacío en los fijos) */
  nota: string;
  /** Lo produce la app desde la ficha (anexos, declaración) */
  generado: boolean;
  /** Palabras con las que se reconoce en el nombre de un archivo del Drive */
  pistas: RegExp;
};

const doc = (nombre: string, pistas: RegExp, nota = "", generado = false): Omit<DocumentoCarpeta, "n"> => ({ nombre, nota, generado, pistas });
const str = (v: unknown) => (v == null || v === "" ? "" : String(v));

/** Lista ordenada de documentos de la carpeta, según la ficha y los bienes. */
export function documentosCarpeta(f: LvsFicha, bienes: BienesPorCategoria, deudas = 0): DocumentoCarpeta[] {
  const out: Omit<DocumentoCarpeta, "n">[] = [doc("Carnet de identidad (ambos lados)", /carnet|c[eé]dula|\bci\b|identidad/i)];
  if (f.relacion_laboral === true) {
    out.push(doc("Contrato de trabajo", /contrato/i, f.empleador ? `Empleador: ${f.empleador}` : "Está trabajando"));
    out.push(doc("Liquidaciones de sueldo (últimas tres)", /liquidaci/i, "Está trabajando"));
  } else {
    out.push(doc("Certificado de cotizaciones (últimas 12)", /cotizaci|afp|previred/i, f.relacion_laboral === false ? "Cesante: reemplaza contrato y liquidaciones" : "Falta responder si está trabajando"));
  }
  out.push(doc("Certificado de la Superintendencia de Insolvencia", /super|insolvencia|concursal/i));
  out.push(doc("Informe de deudas CMF", /cmf|deuda/i));
  out.push(doc("Carpeta tributaria para solicitar créditos", /carpeta/i, "No más de 30 días"));
  out.push(doc("Situación tributaria de terceros", /situaci|terceros/i));
  if (f.estado_civil === "Soltero/a") out.push(doc("Certificado de no matrimonio", /no ?matrimonio|soltero/i, "Soltero/a"));
  else if (f.estado_civil === "Conviviente civil") out.push(doc("Certificado de acuerdo de unión civil", /uni[oó]n civil|auc/i, "Conviviente civil"));
  else if (f.estado_civil) out.push(doc("Certificado de matrimonio", /matrimonio/i, f.estado_civil));
  else out.push(doc("Certificado de matrimonio o de no matrimonio", /matrimonio/i, "Falta el estado civil en la ficha"));

  // Lo variable: cada «sí» del patrimonio trae su anexo y su respaldo; cada juicio, su expediente
  const por = (key: keyof BienesPorCategoria) => bienes[key] ?? [];
  const cat = (key: keyof BienesPorCategoria) => CATEGORIAS.find((c) => c.key === key)!;
  if (f.tiene_bienes_raices) {
    out.push(doc("Anexo N.º 3 · Nómina de bienes raíces", /anexo ?0?3\b/i, "Tiene bienes raíces", true));
    const rows = por("raices");
    if (rows.length === 0) out.push(doc("Certificado de dominio vigente del inmueble", /dominio|vigencia/i, "No más de 30 días · falta cargar el inmueble en la ficha"));
    for (const r of rows) out.push(doc(`Certificado de dominio vigente · ${str(r.rol_avaluo) || str(r.direccion) || "inmueble"}`, /dominio|vigencia/i, "No más de 30 días"));
  }
  if (f.tiene_vehiculos) {
    out.push(doc("Anexo N.º 4 · Nómina de vehículos y bienes registrables", /anexo ?0?4\b/i, "Tiene vehículos", true));
    const rows = por("vehiculos");
    if (rows.length === 0) out.push(doc("Certificado de anotaciones vigentes del vehículo", /anotaciones|\bcav\b|dominio/i, "No más de 5 días · falta cargar el vehículo en la ficha"));
    for (const r of rows) out.push(doc(`Certificado de anotaciones vigentes · ${str(r.patente) || cat("vehiculos").resumen(r as BienRow).titulo}`, new RegExp(`anotaciones|\\bcav\\b|dominio|${str(r.patente) || "§"}`, "i"), "No más de 5 días"));
  }
  if (f.tiene_aguas) {
    out.push(doc("Anexo N.º 5 · Derechos de aguas y concesiones", /anexo ?0?5\b/i, "Tiene derechos de agua o concesiones", true));
    out.push(doc("Certificado del Registro de Aguas o acto de la concesión", /aguas|concesi/i, "No más de 30 días"));
  }
  if (f.tiene_participaciones) {
    out.push(doc("Anexo N.º 6 · Participaciones y comunidades hereditarias", /anexo ?0?6\b/i, "Tiene sociedades, acciones o herencias", true));
    out.push(doc("Documentos de la participación o posesión efectiva", /escritura|accionista|posesi[oó]n|testamento|sociedad/i, "Certificados no más de 30 días"));
  }
  if (f.tiene_instrumentos) {
    out.push(doc("Anexo N.º 7 · Nómina de valores", /anexo ?0?7\b/i, "Tiene instrumentos financieros", true));
    out.push(doc("Documento de cada instrumento con saldo actualizado", /dep[oó]sito|fondo|cartola|saldo/i));
  }
  out.push(doc("Anexo N.º 8 · Otros bienes muebles y financieros", /anexo ?0?8\b/i, por("muebles").length ? `${por("muebles").length} bienes cargados` : f.tiene_bienes_muebles ? "Falta cargar los bienes en la ficha" : "Toda carpeta lo lleva", true));
  out.push(doc("Anexo N.º 9 · Nómina de acreedores", /anexo ?0?9\b/i, deudas ? `${deudas} ${deudas === 1 ? "acreedor cargado" : "acreedores cargados"}` : "Falta cargar las deudas en la ficha", true));
  out.push(doc("Anexo N.º 11 · Declaración jurada de antecedentes completos", /anexo ?11\b|declaraci[oó]n/i, "Se genera desde la ficha", true));
  if (f.tiene_juicios) {
    const rows = por("juicios");
    if (rows.length === 0) out.push(doc("Expediente electrónico (e-book) de cada juicio pendiente", /e-?book|expediente/i, "Falta cargar los juicios en la ficha"));
    for (const r of rows) out.push(doc(`Expediente electrónico (e-book) · ${str(r.rol) || str(r.caratula) || "juicio"}`, new RegExp(`e-?book|expediente|${str(r.rol).replace(/[^A-Za-z0-9-]/g, "") || "§"}`, "i"), str(r.tribunal)));
  }
  return out.map((d, i) => ({ ...d, n: i + 1 }));
}

/** Lo mismo sin la expresión regular: lo que puede viajar a un componente de cliente. */
export type DocumentoPlano = Omit<DocumentoCarpeta, "pistas">;
export const sinPistas = (docs: DocumentoCarpeta[]): DocumentoPlano[] => docs.map((d) => ({ n: d.n, nombre: d.nombre, nota: d.nota, generado: d.generado }));

export type DriveMatch = { name: string; link: string };

/** Para cada documento, el archivo del Drive cuyo nombre lo delata (si hay). Solo orientativo: nadie marca nada. */
export function cruzarConDrive(docs: DocumentoCarpeta[], files: { name: string; webViewLink: string; isFolder: boolean }[]): Map<number, DriveMatch> {
  const out = new Map<number, DriveMatch>();
  const libres = files.filter((f) => !f.isFolder);
  for (const d of docs) {
    const hit = libres.find((f) => d.pistas.test(f.name));
    if (hit) out.set(d.n, { name: hit.name, link: hit.webViewLink });
  }
  return out;
}

/** Texto plano de la lista (para pegarlo en un correo o WhatsApp al cliente). */
export function listaComoTexto(docs: DocumentoPlano[]): string {
  return docs.filter((d) => !d.generado).map((d) => `${d.n}. ${d.nombre}${d.nota && !/falta|etapa/i.test(d.nota) ? ` (${d.nota.toLowerCase()})` : ""}`).join("\n");
}

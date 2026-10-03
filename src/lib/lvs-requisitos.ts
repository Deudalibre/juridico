// Documentos requeridos de una solicitud LVS: qué se exige según la Ficha Maestra y con qué vigencia.
// Reglas tomadas de la Norma de Carácter General N.° 22 (Res. Ex. 6619/2023, Superir) y del modelo de demanda
// del estudio. Sin dependencias de servidor: lo usan la sincronización, la pestaña Documentación y las validaciones.
import type { LvsFicha } from "./lvs";

export type RequisitoDef = {
  codigo: string;
  nombre: string;
  origen: "fijo" | "regla";
  /** Por qué se exige (se muestra bajo el nombre). */
  regla: string | null;
  /** Días de vigencia desde la emisión que exige la norma; null = sin plazo. */
  vigencia_dias: number | null;
  /** Lo produce la app (anexos, declaración): no se sube, se genera. */
  generado: boolean;
};

export type LvsRequisito = {
  id: string;
  client_id: string;
  codigo: string;
  nombre: string;
  origen: "fijo" | "regla" | "manual";
  regla: string | null;
  entidad_tipo: string | null;
  entidad_id: string | null;
  generado: boolean;
  vigencia_dias: number | null;
  fecha_emision: string | null;
  estado: RequisitoEstado;
  document_id: string | null;
  fecha_solicitud: string;
  fecha_carga: string | null;
  cargado_por: string | null;
  fecha_revision: string | null;
  revisado_por: string | null;
  observacion: string | null;
  orden: number;
  updated_at: string;
};

export const ESTADOS_REQUISITO = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  por_revisar: "Por revisar",
  aprobado: "Aprobado",
  observado: "Observado",
  vencido: "Vencido",
  no_aplica: "No aplica",
} as const;
export type RequisitoEstado = keyof typeof ESTADOS_REQUISITO;

export const estadoTone = (e: RequisitoEstado): "" | "brand" | "warn" | "danger" | "success" =>
  e === "pendiente" ? "warn" : e === "recibido" || e === "por_revisar" ? "brand" : e === "aprobado" ? "success" : e === "observado" || e === "vencido" ? "danger" : "";

/** Estados que cuentan como «el documento está» (para la demanda y el resumen). */
export const ESTADOS_OK: RequisitoEstado[] = ["recibido", "por_revisar", "aprobado"];

const def = (codigo: string, nombre: string, origen: "fijo" | "regla", regla: string | null, vigencia_dias: number | null = null, generado = false): RequisitoDef => ({ codigo, nombre, origen, regla, vigencia_dias, generado });

/**
 * Lista de requisitos que corresponde a una ficha. El orden es el de la lista final.
 * Las vigencias son las de la NCG 22: dominio vigente y Registro de Aguas 30 días, CAV 5 días, carpeta
 * tributaria y certificados de accionistas 30 días.
 */
export function requisitosPara(f: LvsFicha): RequisitoDef[] {
  const out: RequisitoDef[] = [
    def("cedula", "Cédula de identidad vigente (ambos lados)", "fijo", null),
    def("cert_superir", "Certificado de la Superintendencia de Insolvencia sobre procedimientos concursales", "fijo", null),
    def("informe_cmf", "Informe de deudas de la Comisión para el Mercado Financiero", "fijo", null),
    def("carpeta_tributaria", "Carpeta tributaria electrónica para solicitar créditos", "fijo", "Art. 273 A n.º 8 · no más de 30 días", 30),
    def("sit_tributaria", "Consulta de situación tributaria de terceros", "fijo", null),
  ];
  if (f.estado_civil === "Soltero/a") out.push(def("cert_no_matrimonio", "Certificado de no matrimonio", "regla", "Estado civil: soltero/a"));
  else if (f.estado_civil === "Casado/a") out.push(def("cert_matrimonio", "Certificado de matrimonio", "regla", "Estado civil: casado/a"));
  if (f.relacion_laboral) {
    out.push(def("contrato_trabajo", "Contrato de trabajo", "regla", "Está trabajando · art. 273 A n.º 2 letra b.8"));
    for (const n of [1, 2, 3]) out.push(def(`liquidacion_${n}`, `Liquidación de sueldo ${n} de 3 (últimos tres meses)`, "regla", "Está trabajando"));
  }
  if (f.tiene_bienes_raices) {
    out.push(def("dominio_vigente", "Certificado de dominio vigente de cada inmueble", "regla", "Tiene bienes raíces · no más de 30 días", 30));
    out.push(def("anexo_3", "Anexo N.º 3 · Nómina de bienes raíces", "regla", "Tiene bienes raíces", null, true));
  }
  if (f.tiene_vehiculos) {
    out.push(def("cav", "Certificado de anotaciones vigentes de cada vehículo", "regla", "Tiene vehículos · no más de 5 días", 5));
    out.push(def("anexo_4", "Anexo N.º 4 · Nómina de vehículos y bienes registrables", "regla", "Tiene vehículos", null, true));
  }
  if (f.tiene_aguas) {
    out.push(def("cert_aguas", "Certificado del Registro de Aguas o acto que otorga la concesión", "regla", "Tiene derechos de agua o concesiones · no más de 30 días", 30));
    out.push(def("anexo_5", "Anexo N.º 5 · Nómina de derechos de aguas y concesiones", "regla", "Tiene derechos de agua o concesiones", null, true));
  }
  if (f.tiene_participaciones) {
    out.push(def("doc_participacion", "Documentos de la participación (escritura, registro de accionistas, posesión efectiva o Registro de Testamentos)", "regla", "Tiene sociedades, acciones o herencias · certificados no más de 30 días", 30));
    out.push(def("anexo_6", "Anexo N.º 6 · Nómina de participaciones y comunidades hereditarias", "regla", "Tiene sociedades, acciones o herencias", null, true));
  }
  if (f.tiene_instrumentos) {
    out.push(def("doc_instrumento", "Documento justificativo de cada instrumento financiero, con saldo actualizado", "regla", "Tiene instrumentos financieros"));
    out.push(def("anexo_7", "Anexo N.º 7 · Nómina de valores", "regla", "Tiene instrumentos financieros", null, true));
  }
  if (f.tiene_bienes_muebles) out.push(def("anexo_8", "Anexo N.º 8 · Nómina de otros bienes muebles y financieros", "regla", "Tiene otros bienes muebles o financieros", null, true));
  out.push(def("anexo_9", "Anexo N.º 9 · Nómina de acreedores", "fijo", "Art. 273 A n.º 5", null, true));
  out.push(def("declaracion_273a", "Declaración jurada de antecedentes completos y fehacientes (Anexo N.º 11)", "fijo", "Art. 273 A n.º 9", null, true));
  return out;
}

/** Vencimiento de un documento con vigencia: fecha límite y si ya pasó. */
export function vencimiento(r: Pick<LvsRequisito, "vigencia_dias" | "fecha_emision">, today = new Date()): { limite: string; vencido: boolean; dias: number } | null {
  if (!r.vigencia_dias || !r.fecha_emision) return null;
  const emision = new Date(`${r.fecha_emision.slice(0, 10)}T12:00:00`);
  const limite = new Date(emision.getTime() + r.vigencia_dias * 86400000);
  const hoy = new Date(today.toISOString().slice(0, 10) + "T12:00:00");
  const dias = Math.round((limite.getTime() - hoy.getTime()) / 86400000);
  return { limite: limite.toISOString().slice(0, 10), vencido: dias < 0, dias };
}

/** Conteos para el resumen y la cabecera. */
export function resumenRequisitos(rows: LvsRequisito[]) {
  const vivos = rows.filter((r) => r.estado !== "no_aplica");
  const ok = vivos.filter((r) => ESTADOS_OK.includes(r.estado)).length;
  return {
    requeridos: vivos.length,
    recibidos: ok,
    pendientes: vivos.filter((r) => r.estado === "pendiente").length,
    observados: vivos.filter((r) => r.estado === "observado" || r.estado === "vencido").length,
    pct: vivos.length ? Math.round((ok / vivos.length) * 100) : 0,
  };
}

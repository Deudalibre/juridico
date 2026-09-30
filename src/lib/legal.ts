// Vocabulario del área jurídica (Ley 20.720). Los pasos de cada procedimiento los definió el estudio;
// aquí se declaran una sola vez para que ficha, lista, tareas y (más adelante) el tablero usen los mismos nombres.

// Solo dos procedimientos (confirmado por el estudio el 2026-09-30): la liquidación «simplificada» no se
// distingue de la voluntaria en el sistema.
export const PROCEDURES = ["Liquidación voluntaria", "Renegociación"] as const;
export type Procedure = (typeof PROCEDURES)[number];

/** Pasos de la liquidación voluntaria, en orden. */
export const LIQUIDACION_STEPS = [
  "Preparación de documentos",
  "Ingreso de demanda",
  "Apercibimientos",
  "Art. 37: nominación en la Superir",
  "Certificado de nominación",
  "Resolución de liquidación",
  "Acta de incautación",
  "Venta de bienes",
  "Rendición de cuenta y cuenta final",
  "Resolución de término",
  "Publicación en el Boletín Concursal",
  "Certificado de ejecutoria",
] as const;

/** Pasos de la renegociación ante la Superintendencia, en orden. */
export const RENEGOCIACION_STEPS = [
  "Preparación de documentos",
  "Ingreso de la solicitud",
  "Admisibilidad",
  "Audiencia de determinación del pasivo",
  "Audiencia de renegociación",
  "Ejecución",
  "Liquidación forzosa",
] as const;

/** Pasos que piden un dato propio al completarse. */
export const STEP_LIQUIDATOR = "Certificado de nominación"; // nombre del liquidador
export const STEP_RESOLUTION = "Resolución de liquidación"; // hito principal: su fecha se muestra en la cabecera
export const STEP_APERCIBIMIENTOS = "Apercibimientos"; // cada apercibimiento es una tarea con vencimiento

/** Pasos que se recuerdan en la cabecera si aún no ocurren (solo liquidación). */
export const COMPLETED = "Completada";

export const CLOSE_REASONS = ["Dejó de pagar", "Se perdió el contacto", "No entregó información", "Desistió", "Otro"] as const;

export const TASK_KINDS: Record<string, string> = {
  apercibimiento: "Apercibimiento",
  audiencia: "Audiencia",
  revisar_causa: "Revisar causa",
  revisar_resolucion: "Revisar resolución",
  preparar_escrito: "Preparar escrito",
  solicitar_documento: "Solicitar documento",
  contactar_cliente: "Contactar al cliente",
  presentar_escrito: "Presentar escrito",
  otra: "Otra",
};

/** Respuestas frecuentes al completar una tarea, por tipo: un clic y queda el resultado anotado. */
export const TASK_QUICK_RESULTS: Record<string, string[]> = {
  apercibimiento: ["Cumplido en plazo", "Escrito presentado", "No se pudo cumplir"],
  audiencia: ["Realizada", "Suspendida", "Reprogramada"],
  revisar_causa: ["Sin novedades", "Con movimiento, anotado"],
  revisar_resolucion: ["Revisada, sin acción", "Requiere escrito"],
  preparar_escrito: ["Escrito listo", "Falta información del cliente"],
  solicitar_documento: ["Documento recibido", "Recibido parcial", "Cliente no responde"],
  contactar_cliente: ["Contactado", "No contesta", "Dejé mensaje"],
  presentar_escrito: ["Presentado", "Rechazado, hay que corregir"],
  otra: ["Hecho"],
};

/** Motivos frecuentes para cancelar una tarea. */
export const CANCEL_REASONS = ["Ya no corresponde", "Duplicada", "La hizo otra persona"];

/** Archivos admitidos en el almacén de documentos (mismos tipos que permite el bucket). */
export const DOC_MIMES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const DOC_MAX_BYTES = 25 * 1024 * 1024;

export const DOC_STATUS: Record<string, string> = {
  pendiente: "Pendiente",
  recibido: "Recibido",
  preparado: "Preparado",
  firmado: "Firmado",
  presentado: "Presentado",
  reemplazado: "Reemplazado",
};

export const isProcedure = (v: string | null | undefined): v is Procedure => PROCEDURES.includes(v as Procedure);
export const isLiquidacion = (p: string | null | undefined) => Boolean(p?.startsWith("Liquidación"));

/** Pasos que corresponden a un procedimiento (ninguno si aún no se definió). */
export const stepsFor = (p: string | null | undefined): readonly string[] => (p === "Renegociación" ? RENEGOCIACION_STEPS : isLiquidacion(p) ? LIQUIDACION_STEPS : []);

/** Paso actual = el primero no completado; «Completada» si no queda ninguno; null si no hay procedimiento. */
export function currentStep(p: string | null | undefined, done: readonly string[]): string | null {
  const steps = stepsFor(p);
  if (steps.length === 0) return null;
  return steps.find((s) => !done.includes(s)) ?? COMPLETED;
}

/** Tono de la etiqueta según procedimiento (mismos tonos que las etiquetas del CRM). */
export const procedureTone = (p: string | null): "" | "brand" | "warn" => (p === "Renegociación" ? "brand" : isLiquidacion(p) ? "" : "warn");

/**
 * Checklist de antecedentes por procedimiento: apagado por decisión del estudio (2026-09-30), «por ahora solo
 * vemos el Drive». Las tablas y las acciones siguen existiendo; al volver a true reaparece en la ficha.
 */
export const CHECKLIST_ENABLED = false;

/** Revisión de causas: cada cuánto vuelve a tocar revisar una causa (días); el revisor puede elegir otro plazo. */
export const REVIEW_EVERY_DAYS = 7;

/**
 * Cadencia de revisión según el estado de la causa (misma regla que legal_review_cadence_days en la base):
 * mientras no tenga su hito (resolución de liquidación; «Ejecución» en renegociación) se revisa cada 3 días,
 * porque es cuando el tribunal puede pedir algo con plazo; después, cada 7. Quien revisa no elige la fecha.
 */
export const REVIEW_CADENCE = { critical: 3, settled: 7 } as const;
export const STEP_RENEGOCIACION_HITO = "Ejecución";
export const hitoFor = (p: string | null | undefined) => (p === "Renegociación" ? STEP_RENEGOCIACION_HITO : STEP_RESOLUTION);

export function reviewCadence(p: string | null | undefined, done: readonly string[]): { days: number; critical: boolean; label: string; reason: string } {
  const hito = hitoFor(p);
  if (done.includes(hito)) return { days: REVIEW_CADENCE.settled, critical: false, label: "Con " + hito.toLowerCase(), reason: `ya tiene ${hito.toLowerCase()}` };
  return { days: REVIEW_CADENCE.critical, critical: true, label: "Sin " + hito.toLowerCase(), reason: `aún sin ${hito.toLowerCase()}` };
}

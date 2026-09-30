// Vocabulario del área jurídica (Ley 20.720). Los pasos de cada procedimiento los definió el estudio;
// aquí se declaran una sola vez para que ficha, lista, tareas y (más adelante) el tablero usen los mismos nombres.

export const PROCEDURES = ["Liquidación voluntaria", "Liquidación simplificada", "Renegociación"] as const;
export type Procedure = (typeof PROCEDURES)[number];

/** Pasos de la liquidación voluntaria (y simplificada), en orden. */
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

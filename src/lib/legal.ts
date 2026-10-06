import type { CSSProperties } from "react";
// Vocabulario del área jurídica (Ley 20.720). Los pasos de cada procedimiento los definió el estudio;
// aquí se declaran una sola vez para que ficha, lista, revisión y tareas usen los mismos nombres.

// Solo dos procedimientos (confirmado por el estudio el 2026-09-30): la liquidación «simplificada» no se
// distingue de la voluntaria en el sistema.
export const PROCEDURES = ["Liquidación voluntaria", "Renegociación"] as const;
export type Procedure = (typeof PROCEDURES)[number];

/**
 * Pasos de la liquidación voluntaria, en orden (ciclo definido por el estudio el 2026-09-30): ingreso de la demanda,
 * acreditado con el Certificado de envío de causa → apercibimientos → nominación del liquidador, acreditada con el
 * Certificado de nominación (la solicitud del art. 37 va directo al tribunal, sin comprobante) → Resolución de
 * liquidación (hito) → gestiones del liquidador → Resolución de término, que al subirse cierra la causa como
 * «Causa terminada».
 *
 * La preparación de documentos (juntar antecedentes y firmas antes de ingresar) no es un paso que se marque: el
 * programa la infiere (2026-10-05): mientras la causa no tenga rol ni fecha de ingreso está «En preparación».
 */
const LIQUIDACION_STEPS = [
  "Ingreso de demanda",
  "Apercibimientos",
  "Nominación del liquidador",
  "Resolución de liquidación",
  "Acta de incautación",
  "Venta de bienes",
  "Rendición de cuenta y cuenta final",
  "Resolución de término",
] as const;

/** Pasos de la renegociación ante la Superintendencia, en orden. */
const RENEGOCIACION_STEPS = [
  "Ingreso de la solicitud",
  "Admisibilidad",
  "Audiencia de determinación del pasivo",
  "Audiencia de renegociación",
  "Ejecución",
  "Liquidación forzosa",
] as const;

/** Pasos que piden un dato propio al completarse. */
export const STEP_FILING = "Ingreso de demanda"; // rol, tribunal y fecha de ingreso, con el certificado de envío
export const STEP_LIQUIDATOR = "Nominación del liquidador"; // nombre del liquidador, con el certificado de nominación
export const STEP_RESOLUTION = "Resolución de liquidación"; // hito principal: su fecha se muestra en la cabecera
export const STEP_TERMINATION = "Resolución de término"; // al subirla, la causa se cierra como terminada
export const STEP_APERCIBIMIENTOS = "Apercibimientos"; // cada apercibimiento es una tarea con vencimiento

/** Comprobante que pide cada paso al marcarlo (la base lo exige también: trigger legal_case_steps_guard). */
export const STEP_DOCS: Record<string, { label: string; required: boolean; hint: string }> = {
  [STEP_FILING]: { label: "Certificado de envío de causa", required: true, hint: "Lo entrega la Oficina Judicial Virtual al ingresar la demanda: confirma que la causa quedó en el tribunal, con su rol." },
  [STEP_LIQUIDATOR]: { label: "Certificado de nominación", required: true, hint: "Lo emite la Superir con el liquidador titular nominado." },
  [STEP_RESOLUTION]: { label: "Resolución de liquidación", required: false, hint: "Copia de la resolución, si la tienes a mano (recomendado)." },
  [STEP_TERMINATION]: { label: "Resolución de término", required: true, hint: "Al subirla, la causa queda cerrada como «Causa terminada»." },
};

/** Pasos que se recuerdan en la cabecera si aún no ocurren (solo liquidación). */
export const COMPLETED = "Completada";

/** Motivos de cierre manual; «Causa terminada» lo pone el sistema con la resolución de término. */
export const CLOSE_REASONS = ["Dejó de pagar", "Se perdió el contacto", "No entregó información", "Desistió", "Otro"] as const;
export const CLOSE_TERMINATED = "Causa terminada";

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

/** Situación que el programa infiere, no un paso: la causa aún no tiene fecha de ingreso (misma regla que Revisión). */
export const IN_PREPARATION = "En preparación";

/**
 * Qué mostrar como paso en listas y cabecera. Si todavía no se ingresó la demanda (sin fecha de ingreso, como agrupa
 * Revisión) la causa está «En preparación», que el programa deduce solo; después, el paso actual (el primero no
 * completado).
 */
export function stepLabel(c: { procedure_type: string | null; current_step: string | null; intake_date: string | null }): string | null {
  const steps = stepsFor(c.procedure_type);
  if (steps.length === 0) return null;
  const current = c.current_step ?? steps[0];
  return current === steps[0] && !c.intake_date ? IN_PREPARATION : current;
}

/**
 * Semáforo de la causa: el color con que el estudio marca cada causa en su planilla, ahora en la app. Lo cambia el
 * abogado tramitador con un clic; no se deduce de los pasos. Clave = valor en legal_clients.semaforo (0032).
 */
export const SEMAFORO: Record<string, { label: string; hint: string; color: string }> = {
  ok: { label: "Al día", hint: "Patrocinio y poder al día, o escrito de PyP enviado", color: "verde" },
  apercibimiento: { label: "Apercibimiento", hint: "El tribunal pidió algo con plazo", color: "amarillo" },
  rechazada: { label: "Demanda rechazada", hint: "Hay que corregir y reingresar", color: "rojo" },
  reingresada: { label: "Demanda reingresada", hint: "Reingresada tras el rechazo; a la espera del tribunal", color: "celeste" },
  nominar: { label: "Nominar", hint: "Falta nominar al liquidador", color: "naranjo" },
  pyp_zoom: { label: "PyP por Zoom", hint: "Patrocinio y poder pendiente de ratificar por videoconferencia", color: "azul" },
};
export const SEMAFORO_KEYS = Object.keys(SEMAFORO);
/** Variables CSS del color elegido (definidas en globals.css como --sem-<clave> y --sem-<clave>-bg). */
export const semaforoStyle = (key: string | null | undefined): CSSProperties | undefined =>
  key && key in SEMAFORO ? ({ "--sem-color": `var(--sem-${key})`, "--sem-bg": `var(--sem-${key}-bg)` } as CSSProperties) : undefined;
export const isSemaforo = (v: string | null | undefined): v is keyof typeof SEMAFORO => Boolean(v && v in SEMAFORO);

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
const STEP_RENEGOCIACION_HITO = "Ejecución";
const hitoFor = (p: string | null | undefined) => (p === "Renegociación" ? STEP_RENEGOCIACION_HITO : STEP_RESOLUTION);

export function reviewCadence(p: string | null | undefined, done: readonly string[]): { days: number; critical: boolean; label: string; reason: string } {
  const hito = hitoFor(p);
  if (done.includes(hito)) return { days: REVIEW_CADENCE.settled, critical: false, label: "Con " + hito.toLowerCase(), reason: `ya tiene ${hito.toLowerCase()}` };
  return { days: REVIEW_CADENCE.critical, critical: true, label: "Sin " + hito.toLowerCase(), reason: `aún sin ${hito.toLowerCase()}` };
}

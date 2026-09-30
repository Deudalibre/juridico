// Vocabulario del área jurídica (Ley 20.720). Los pasos de cada procedimiento los definió el estudio;
// aquí solo se declaran para que ficha, lista y (más adelante) el tablero usen los mismos nombres.

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

export const isProcedure = (v: string | null | undefined): v is Procedure => PROCEDURES.includes(v as Procedure);

/** Tono de la etiqueta según procedimiento (mismos tonos que las etiquetas del CRM). */
export const procedureTone = (p: string | null): "" | "brand" | "warn" =>
  p === "Renegociación" ? "brand" : p?.startsWith("Liquidación") ? "" : "warn";

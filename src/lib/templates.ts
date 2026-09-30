// Plantillas Word con variables: tipos, campos de la ficha que se rellenan solos y utilidades de nombres.
// Sin dependencias de servidor: se usa tanto en el editor (navegador) como en las acciones.
import type { LegalClient } from "./data";
import { formatRut } from "./rut";

export const VAR_TYPES = { texto: "Texto", fecha: "Fecha", numero: "Número", moneda: "Monto en pesos" } as const;
export type VarType = keyof typeof VAR_TYPES;

export type TemplateVariable = {
  name: string; // lo que va entre llaves en el Word: {nombre_completo}
  label: string; // cómo se le pide al usuario: «Nombre completo»
  type: VarType;
  source: string | null; // clave de FICHA_FIELDS si se rellena sola desde la ficha; null = se pide al generar
};

export type LegalTemplate = {
  id: string;
  name: string;
  description: string | null;
  procedure_type: string | null;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  version: number;
  variables: TemplateVariable[];
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_BUCKET = "legal-templates";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TEMPLATE_MAX_BYTES = 25 * 1024 * 1024;

/** Datos de la ficha del cliente que una variable puede tomar sin preguntar nada. */
export const FICHA_FIELDS: { key: string; label: string; type: VarType }[] = [
  { key: "nombre_completo", label: "Nombre completo", type: "texto" },
  { key: "rut", label: "RUT", type: "texto" },
  { key: "telefono", label: "Teléfono", type: "texto" },
  { key: "email", label: "Email", type: "texto" },
  { key: "numero_interno", label: "N° interno de la causa", type: "texto" },
  { key: "procedimiento", label: "Procedimiento", type: "texto" },
  { key: "tribunal", label: "Tribunal", type: "texto" },
  { key: "rol", label: "Rol de la causa", type: "texto" },
  { key: "caratula", label: "Carátula", type: "texto" },
  { key: "fecha_ingreso", label: "Fecha de ingreso", type: "fecha" },
  { key: "liquidador", label: "Nombre del liquidador", type: "texto" },
  { key: "fecha_resolucion_liquidacion", label: "Fecha de la resolución de liquidación", type: "fecha" },
  { key: "abogado", label: "Abogado a cargo", type: "texto" },
  { key: "fecha_hoy", label: "Fecha de hoy", type: "fecha" },
];

export const fieldLabel = (key: string | null) => FICHA_FIELDS.find((f) => f.key === key)?.label ?? null;

/** Nombre válido de variable: minúsculas, dígitos y guion bajo, empieza por letra, hasta 40 caracteres. */
export const isVarName = (s: string) => /^[a-z][a-z0-9_]{0,39}$/.test(s);

/** Propone un nombre de variable a partir de un texto («Nombre Completo» → nombre_completo). */
export function slugName(text: string) {
  const s = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(?=[0-9])/, "v")
    .slice(0, 40)
    .replace(/_+$/, "");
  return s || "variable";
}

/** Etiqueta legible a partir del nombre (nombre_completo → «Nombre completo»). */
export const humanize = (name: string) => {
  const s = name.replace(/_+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : name;
};

/** Marcadores simples {nombre} presentes en un texto (no cuenta bucles {#x} ni condiciones {^x}). */
export const VAR_RE = /\{([a-z][a-z0-9_]{0,39})\}/g;
export function variableNames(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) out.add(m[1]);
  return Array.from(out);
}

const longDate = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Valores de la ficha para rellenar variables (formato ya listo para un documento legal). */
export function clientValues(c: LegalClient, lawyerName: string | null, today = new Date()): Record<string, string> {
  return {
    nombre_completo: c.full_name,
    rut: c.rut ? formatRut(c.rut) : "",
    telefono: c.phone ?? "",
    email: c.email ?? "",
    numero_interno: c.internal_number ?? "",
    procedimiento: c.procedure_type ?? "",
    tribunal: c.tribunal ?? "",
    rol: c.rol ?? "",
    caratula: c.caratula ?? "",
    fecha_ingreso: longDate(c.intake_date),
    liquidador: c.liquidator_name ?? "",
    fecha_resolucion_liquidacion: longDate(c.liquidation_resolution_at),
    abogado: lawyerName ?? "",
    fecha_hoy: today.toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santiago" }),
  };
}

/** Limpia y valida una variable que llega del formulario. */
export function normalizeVariable(input: Partial<TemplateVariable>): { ok: true; v: TemplateVariable } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  if (!isVarName(name)) return { ok: false, error: "El nombre debe ir en minúsculas, sin espacios ni tildes (p. ej. nombre_completo)." };
  const label = String(input.label ?? "").trim().slice(0, 120) || humanize(name);
  const type = (input.type && input.type in VAR_TYPES ? input.type : "texto") as VarType;
  const source = input.source && FICHA_FIELDS.some((f) => f.key === input.source) ? input.source : null;
  return { ok: true, v: { name, label, type, source } };
}

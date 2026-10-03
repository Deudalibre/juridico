// Liquidación Voluntaria Simplificada (LVS): vocabulario de la Ficha Maestra y cálculo de avance.
// Sin dependencias de servidor: se usa en formularios, páginas y acciones.
import type { LegalClient } from "./data";

export type LvsFicha = {
  client_id: string;
  genero: "F" | "M" | null;
  nacionalidad: string;
  estado_civil: string | null;
  profesion_oficio: string | null;
  domicilio: string | null;
  comuna: string | null;
  region: string | null;
  relacion_laboral: boolean | null;
  empleador: string | null;
  rut_empleador: string | null;
  comuna_tribunal: string | null;
  sj_comuna: string | null;
  carta_original: string | null;
  carta_demanda: string | null;
  tiene_bienes_raices: boolean | null;
  tiene_vehiculos: boolean | null;
  tiene_aguas: boolean | null;
  tiene_participaciones: boolean | null;
  tiene_instrumentos: boolean | null;
  tiene_bienes_muebles: boolean | null;
  tiene_juicios: boolean | null;
  estado: LvsEstado;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const LVS_ESTADOS = {
  borrador: "Borrador",
  ficha_completa: "Ficha completa",
  documentacion: "Documentación en curso",
  lista: "Lista para generar",
  generada: "Generada",
  presentada: "Presentada",
} as const;
export type LvsEstado = keyof typeof LVS_ESTADOS;
export const lvsEstadoTone = (e: LvsEstado): "" | "brand" | "warn" | "success" =>
  e === "borrador" ? "warn" : e === "generada" || e === "presentada" ? "success" : e === "ficha_completa" ? "" : "brand";

export const GENEROS = { F: "Femenino", M: "Masculino" } as const;
export const ESTADOS_CIVILES = ["Soltero/a", "Casado/a", "Divorciado/a", "Viudo/a", "Conviviente civil", "Separado/a"] as const;

export type Pregunta273A =
  | "tiene_bienes_raices"
  | "tiene_vehiculos"
  | "tiene_aguas"
  | "tiene_participaciones"
  | "tiene_instrumentos"
  | "tiene_bienes_muebles"
  | "tiene_juicios";

/**
 * Las siete preguntas del art. 273 A: seis del numeral 1 (patrimonio, Anexos 3 a 8) y una del numeral 4 (juicios).
 * La exclusión de bienes no se pregunta: se marca bien por bien en cada anexo. Cada «sí» abre su lista y decide un párrafo de la demanda.
 */
export const PREGUNTAS_273A: { key: Pregunta273A; numeral: 1 | 4; label: string; hint: string; anexo?: number }[] = [
  { key: "tiene_bienes_raices", numeral: 1, anexo: 3, label: "Bienes raíces", hint: "Casas, departamentos, sitios o parcelas a su nombre" },
  { key: "tiene_vehiculos", numeral: 1, anexo: 4, label: "Vehículos u otros bienes registrables", hint: "Autos, motos, remolques" },
  { key: "tiene_aguas", numeral: 1, anexo: 5, label: "Derechos de agua o concesiones", hint: "Aprovechamiento de aguas, concesiones mineras o marítimas" },
  { key: "tiene_participaciones", numeral: 1, anexo: 6, label: "Sociedades, acciones o herencias", hint: "Participación en empresas, acciones, comunidades hereditarias" },
  { key: "tiene_instrumentos", numeral: 1, anexo: 7, label: "Instrumentos financieros transables", hint: "Fondos mutuos, depósitos a plazo, bonos" },
  { key: "tiene_bienes_muebles", numeral: 1, anexo: 8, label: "Otros bienes muebles o financieros", hint: "Anexo 8: muebles, electrodomésticos, ahorros, cuenta 2 AFP, efectivo" },
  { key: "tiene_juicios", numeral: 4, label: "Juicios pendientes", hint: "Causas civiles, laborales o de familia en curso" },
];

/** Qué falta para dar la ficha por completa: lo mínimo que piden la demanda y la Declaración 273-A. */
export function lvsProgress(f: LvsFicha | null, c: Pick<LegalClient, "full_name" | "rut">): { pct: number; missing: string[]; total: number; done: number } {
  const checks: [string, boolean][] = [
    ["nombre", Boolean(c.full_name?.trim())],
    ["RUT", Boolean(c.rut)],
    ["género", Boolean(f?.genero)],
    ["estado civil", Boolean(f?.estado_civil)],
    ["profesión u oficio", Boolean(f?.profesion_oficio)],
    ["domicilio", Boolean(f?.domicilio)],
    ["comuna", Boolean(f?.comuna)],
    ["región", Boolean(f?.region)],
    ["tribunal", Boolean(f?.sj_comuna)],
    ["situación laboral", f?.relacion_laboral != null && (!f.relacion_laboral || Boolean(f.empleador))],
    ["carta de insolvencia", Boolean(f?.carta_demanda?.trim())],
  ];
  for (const q of PREGUNTAS_273A) checks.push([q.label.toLowerCase(), f?.[q.key] != null]);
  const done = checks.filter(([, ok]) => ok).length;
  return { pct: Math.round((done / checks.length) * 100), missing: checks.filter(([, ok]) => !ok).map(([k]) => k), total: checks.length, done };
}

/** Pestañas del expediente. Las de etapas posteriores ya tienen su lugar aunque todavía no tengan contenido. */
export const LVS_TABS = ["Resumen", "Ficha maestra", "Documentación", "Generados", "Historial"] as const;
export type LvsTab = (typeof LVS_TABS)[number];

export const PREGUNTAS_BIENES = PREGUNTAS_273A.filter((q) => q.numeral === 1);
export const PREGUNTA_JUICIOS = PREGUNTAS_273A.find((q) => q.numeral === 4)!;

/** Variables de plantilla que salen de la Ficha Maestra (se suman a las de la ficha del cliente). */
export function lvsValues(f: LvsFicha | null): Record<string, string> {
  const fem = f?.genero === "F";
  return {
    nacionalidad: f?.nacionalidad ?? "",
    // «Soltero/a» → «Soltera» o «Soltero» según el género (Conviviente civil no cambia)
    estado_civil: f?.estado_civil ? (f.estado_civil.endsWith("o/a") ? f.estado_civil.slice(0, -3) + (fem ? "a" : "o") : f.estado_civil) : "",
    profesion_oficio: f?.profesion_oficio ?? "",
    domicilio: f?.domicilio ?? "",
    comuna: f?.comuna ?? "",
    region: f?.region ?? "",
    sj_comuna: f?.sj_comuna ?? "",
    carta_de_insolvencia: f?.carta_demanda ?? "",
    don_dona: f?.genero ? (fem ? "doña" : "don") : "",
    domiciliado_a: f?.genero ? (fem ? "domiciliada" : "domiciliado") : "",
    el_la_solicitante: f?.genero ? (fem ? "la solicitante" : "el solicitante") : "",
  };
}

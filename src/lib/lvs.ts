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
  situacion_laboral: string | null;
  empleador: string | null;
  rut_empleador: string | null;
  fecha_inicio_contrato: string | null;
  tipo_contrato: string | null;
  ingreso_liquido: number | null;
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
  tiene_bienes_excluidos: boolean | null;
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
export const SITUACIONES_LABORALES = ["Dependiente", "Independiente", "Pensionado/a", "Cesante", "Otra"] as const;
export const TIPOS_CONTRATO = ["Indefinido", "Plazo fijo", "Por obra o faena", "Honorarios", "Otro"] as const;

export type Pregunta273A =
  | "tiene_bienes_raices"
  | "tiene_vehiculos"
  | "tiene_aguas"
  | "tiene_participaciones"
  | "tiene_instrumentos"
  | "tiene_bienes_muebles"
  | "tiene_juicios"
  | "tiene_bienes_excluidos";

/** Las ocho preguntas del art. 273 A. Cada «sí» abre su lista (etapas siguientes) y decide un párrafo de la demanda. */
export const PREGUNTAS_273A: { key: Pregunta273A; label: string; hint: string }[] = [
  { key: "tiene_bienes_raices", label: "Bienes raíces", hint: "Casas, departamentos, sitios o parcelas a su nombre" },
  { key: "tiene_vehiculos", label: "Vehículos u otros bienes registrables", hint: "Autos, motos, remolques" },
  { key: "tiene_aguas", label: "Derechos de agua o concesiones", hint: "Aprovechamiento de aguas, concesiones mineras o marítimas" },
  { key: "tiene_participaciones", label: "Sociedades, acciones o herencias", hint: "Participación en empresas, acciones, comunidades hereditarias" },
  { key: "tiene_instrumentos", label: "Instrumentos financieros transables", hint: "Fondos mutuos, depósitos a plazo, bonos" },
  { key: "tiene_bienes_muebles", label: "Otros bienes muebles o financieros", hint: "Anexo 8: muebles, electrodomésticos, ahorros, cuenta 2 AFP, efectivo" },
  { key: "tiene_juicios", label: "Juicios pendientes", hint: "Causas civiles, laborales o de familia en curso" },
  { key: "tiene_bienes_excluidos", label: "Bienes legalmente excluidos", hint: "Bienes inembargables o de terceros que están en su poder" },
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
export const LVS_TABS = ["Resumen", "Ficha maestra", "Bienes", "Acreedores", "Juicios", "Documentación", "Generados", "Historial"] as const;
export type LvsTab = (typeof LVS_TABS)[number];

/** Variables de plantilla que salen de la Ficha Maestra (se suman a las de la ficha del cliente). */
export function lvsValues(f: LvsFicha | null): Record<string, string> {
  const fem = f?.genero === "F";
  return {
    nacionalidad: f?.nacionalidad ?? "",
    estado_civil: f?.estado_civil ? f.estado_civil.replace("/a", fem ? "a" : "") : "",
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

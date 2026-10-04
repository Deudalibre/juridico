// Documentos que la app genera en la LVS: nombres y etapa en que se habilitan.
// Sin dependencias de servidor: lo usan la pestaña Generados, las acciones y el generador.

export type GeneradoTipo = "anexo3" | "anexo4" | "anexo5" | "anexo6" | "anexo7" | "anexo8" | "anexo9" | "declaracion_273a" | "demanda_lvs";

export const GENERADOS: Record<GeneradoTipo, { nombre: string; etapa: number }> = {
  anexo3: { nombre: "Anexo N.º 3 · Nómina de bienes raíces", etapa: 4 },
  anexo4: { nombre: "Anexo N.º 4 · Nómina de vehículos motorizados y otros bienes registrables", etapa: 4 },
  anexo5: { nombre: "Anexo N.º 5 · Nómina de derechos de aprovechamiento de aguas y concesiones", etapa: 4 },
  anexo6: { nombre: "Anexo N.º 6 · Nómina de derechos o acciones en entidades y comunidades hereditarias", etapa: 4 },
  anexo7: { nombre: "Anexo N.º 7 · Nómina de valores (instrumentos financieros transables)", etapa: 4 },
  anexo8: { nombre: "Anexo N.º 8 · Nómina de otros bienes muebles y financieros", etapa: 4 },
  anexo9: { nombre: "Anexo N.º 9 · Nómina de acreedores", etapa: 7 },
  declaracion_273a: { nombre: "Declaración jurada 273 A (Anexo N.º 11)", etapa: 8 },
  demanda_lvs: { nombre: "Solicitud de liquidación voluntaria simplificada", etapa: 9 },
};

export type LvsGenerado = {
  id: string;
  client_id: string;
  tipo: GeneradoTipo;
  template_id: string | null;
  template_version: number | null;
  document_id: string | null;
  storage_path: string;
  file_name: string;
  estado: "borrador" | "final" | "reemplazado";
  replaces_id: string | null;
  datos: Record<string, unknown> | null;
  advertencias: string[] | null;
  generado_por: string | null;
  generado_at: string;
};

/** Anexos de bienes (3 a 7): a qué categoría de la ficha corresponde cada uno. */
export const ANEXO_CATEGORIA: Partial<Record<GeneradoTipo, "raices" | "vehiculos" | "aguas" | "participaciones" | "instrumentos">> = {
  anexo3: "raices",
  anexo4: "vehiculos",
  anexo5: "aguas",
  anexo6: "participaciones",
  anexo7: "instrumentos",
};

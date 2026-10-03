// Bienes de la LVS (art. 273 A n.º 1): catálogos oficiales de los Anexos 3 a 8 (NCG 22) y la descripción de
// cada categoría (tabla, campos y resumen) que usan el formulario, las acciones y, más adelante, los anexos Word.
// Sin dependencias de servidor.
import type { Pregunta273A } from "./lvs";

/* ---------- Códigos tal como figuran al pie de cada anexo ---------- */

export const TIPOS_VEHICULO: Record<number, string> = {
  1: "Automóvil", 2: "Bus", 3: "Minibús", 4: "Camión", 5: "Camión tolva", 6: "Camioneta", 7: "Jeep", 8: "Furgón", 9: "Furgoneta", 10: "Grúa",
  11: "Moto", 12: "Cuatrimoto", 13: "Motor home", 14: "Station wagon", 15: "Todo terreno", 16: "Tractor", 17: "Cosechadora", 18: "Aeronave", 19: "Nave o artefacto naval", 20: "Otro vehículo o bien registrable",
};
export const TIPOS_BIEN_MUEBLE: Record<number, string> = {
  1: "Muebles y artículos de casa", 2: "Maquinaria y equipos", 3: "Herramientas", 4: "Existencias / inventario / mercadería", 5: "Mobiliario de oficina", 6: "Equipos computacionales",
  7: "Electrodomésticos y línea blanca", 8: "Equipos electrónicos", 9: "Instalaciones menores", 10: "Plantas agrícolas", 11: "Pinturas y obras de arte", 12: "Pertrechos para la defensa y seguridad pública",
  13: "Bicicletas / scooter / máquinas de ejercicio", 14: "Joyas", 15: "Criptomonedas", 16: "Cuentas de ahorro", 17: "Facturas por cobrar", 18: "Saldos en cuenta corriente", 19: "Cuenta 2 AFP",
  20: "Libretas de ahorro", 21: "Seguros con ahorro", 22: "Dinero efectivo", 23: "Otros",
};
export const TITULOS_PARTICIPACION: Record<number, string> = { 1: "Acción", 2: "Comunidad sin RUT ni giro", 3: "Derechos sociales", 4: "Otro" };
export const TITULOS_VALOR: Record<number, string> = {
  1: "Bonos", 2: "Contratos forwards", 3: "Cuotas de fondos de inversión", 4: "Cuotas de fondos mutuos", 5: "Debentures", 6: "Depósito a plazo", 7: "Futuros", 8: "Instrumentos de deuda del Banco Central",
  9: "Instrumentos de deuda de la Tesorería", 10: "Letra de cambio", 11: "Opciones de compra o venta de acciones", 12: "Pagaré", 13: "Planes de ahorro", 14: "Swaps", 15: "Otro",
};
export const TIPO_DERECHO_AGUA: Record<number, string> = { 1: "Consuntivo", 2: "No consuntivo" };
export const NATURALEZA_AGUA: Record<number, string> = { 1: "Subterránea", 2: "Superficial" };
export const ACTO_CONCESION: Record<number, string> = { 1: "Resolución", 2: "Decreto" };

const opts = (m: Record<number, string>) => Object.entries(m).map(([k, v]) => ({ key: k, label: `${k} — ${v}` }));

/* ---------- Descripción de las categorías ---------- */

export type FieldType = "text" | "number" | "money" | "date" | "select" | "bool" | "textarea";
export type BienField = {
  name: string;
  label: string;
  type: FieldType;
  options?: { key: string; label: string }[];
  /** Columnas (de 12) que ocupa en el formulario */
  span?: number;
  /** Solo se muestra cuando el campo `when` vale `is` (subtipos del Anexo 5 y 6) */
  when?: { field: string; is: string };
  placeholder?: string;
};
export type BienRow = { id: string; client_id: string; orden: number; excluido: boolean; gravamen?: boolean; hipoteca?: boolean } & Record<string, unknown>;

export type BienCategoria = {
  key: BienCategoriaKey;
  table: string;
  pregunta: Pregunta273A;
  /** Anexo oficial que lista esta categoría; los juicios no tienen anexo (van en el numeral 4 de la demanda) */
  anexo?: number;
  titulo: string;
  singular: string;
  /** Qué documento de dominio exige cada fila (código de requisito) y su vigencia */
  requisito?: { codigo: string; nombre: (r: BienRow) => string; vigencia_dias: number; regla: string };
  fields: BienField[];
  /** Línea de resumen en la lista */
  resumen: (r: BienRow) => { titulo: string; detalle: string };
};
export type BienCategoriaKey = "raices" | "vehiculos" | "aguas" | "participaciones" | "instrumentos" | "muebles" | "juicios";
export const CALIDADES_JUICIO = ["Demandante", "Demandado", "Tercero"] as const;

const excl: BienField[] = [
  { name: "excluido", label: "Bien excluido", type: "bool", span: 3 },
  { name: "motivo_exclusion", label: "Motivo legal de la exclusión", type: "text", span: 9, when: { field: "excluido", is: "si" }, placeholder: "inembargable, de un tercero, art. 445 CPC…" },
];
const grav = (label = "Gravamen"): BienField[] => [
  { name: "gravamen", label, type: "bool", span: 3 },
  { name: "gravamen_detalle", label: "Acreedor y detalle del gravamen", type: "text", span: 9, when: { field: "gravamen", is: "si" } },
];
const obs: BienField = { name: "observaciones", label: "Observaciones", type: "textarea", span: 12 };
const str = (v: unknown) => (v == null || v === "" ? "" : String(v));
const money = (v: unknown) => (typeof v === "number" ? `$${v.toLocaleString("es-CL")}` : "");

export const CATEGORIAS: BienCategoria[] = [
  {
    key: "raices",
    table: "legal_lvs_bienes_raices",
    pregunta: "tiene_bienes_raices",
    anexo: 3,
    titulo: "Bienes raíces",
    singular: "inmueble",
    requisito: { codigo: "dominio_vigente", nombre: (r) => `Certificado de dominio vigente · ${str(r.rol_avaluo) || str(r.direccion) || "inmueble"}`, vigencia_dias: 30, regla: "Bien raíz · no más de 30 días" },
    fields: [
      { name: "descripcion", label: "Descripción", type: "text", span: 6, placeholder: "casa, departamento, sitio…" },
      { name: "tipo", label: "Tipo", type: "select", span: 3, options: [{ key: "No agrícola", label: "No agrícola" }, { key: "Agrícola", label: "Agrícola" }] },
      { name: "clase_propiedad", label: "Clase de propiedad", type: "text", span: 3, placeholder: "propia, en comunidad…" },
      { name: "direccion", label: "Dirección", type: "text", span: 6 },
      { name: "comuna", label: "Comuna", type: "text", span: 3 },
      { name: "region", label: "Región", type: "text", span: 3 },
      { name: "rol_avaluo", label: "Rol de avalúo", type: "text", span: 3 },
      { name: "avaluo_fiscal", label: "Avalúo fiscal", type: "money", span: 3 },
      { name: "valor_comercial", label: "Valor comercial", type: "money", span: 3 },
      { name: "porcentaje_dominio", label: "% de dominio", type: "number", span: 3 },
      { name: "numero_inscripcion", label: "N.º de inscripción", type: "text", span: 3 },
      { name: "fojas", label: "Fojas", type: "text", span: 2 },
      { name: "anio", label: "Año", type: "number", span: 2 },
      { name: "conservador", label: "Conservador de Bienes Raíces", type: "text", span: 5 },
      { name: "fecha_adquisicion", label: "Fecha de adquisición", type: "date", span: 3 },
      { name: "hipoteca", label: "Hipoteca o garantía", type: "bool", span: 3 },
      { name: "hipoteca_detalle", label: "Acreedor hipotecario y detalle", type: "text", span: 6, when: { field: "hipoteca", is: "si" } },
      ...excl,
      obs,
    ],
    resumen: (r) => ({ titulo: [str(r.descripcion), str(r.direccion)].filter(Boolean).join(" · ") || "Inmueble", detalle: [str(r.comuna), r.rol_avaluo ? `rol ${str(r.rol_avaluo)}` : "", money(r.avaluo_fiscal), r.hipoteca ? "con hipoteca" : ""].filter(Boolean).join(" · ") }),
  },
  {
    key: "vehiculos",
    table: "legal_lvs_vehiculos",
    pregunta: "tiene_vehiculos",
    anexo: 4,
    titulo: "Vehículos y otros bienes registrables",
    singular: "vehículo",
    requisito: { codigo: "cav", nombre: (r) => `Certificado de anotaciones vigentes · ${str(r.patente) || str(r.descripcion) || "vehículo"}`, vigencia_dias: 5, regla: "Vehículo · no más de 5 días" },
    fields: [
      { name: "tipo_codigo", label: "Tipo (código del Anexo 4)", type: "select", span: 4, options: opts(TIPOS_VEHICULO) },
      { name: "patente", label: "Patente o matrícula", type: "text", span: 3 },
      { name: "marca", label: "Marca", type: "text", span: 3 },
      { name: "modelo", label: "Modelo", type: "text", span: 2 },
      { name: "anio", label: "Año de fabricación", type: "number", span: 3 },
      { name: "numero_inscripcion", label: "N.º de inscripción", type: "text", span: 3 },
      { name: "avaluo_fiscal", label: "Avalúo fiscal", type: "money", span: 3 },
      { name: "tasacion", label: "Tasación o valor comercial", type: "money", span: 3 },
      { name: "descripcion", label: "Descripción", type: "text", span: 8 },
      { name: "estado", label: "Estado", type: "text", span: 4, placeholder: "bueno, regular, en desarme…" },
      ...grav("Gravamen o prenda"),
      ...excl,
      obs,
    ],
    resumen: (r) => ({ titulo: [str(r.marca), str(r.modelo), str(r.anio)].filter(Boolean).join(" ") || str(r.descripcion) || "Vehículo", detalle: [str(r.patente), r.tipo_codigo ? TIPOS_VEHICULO[Number(r.tipo_codigo)] : "", money(r.avaluo_fiscal), r.gravamen ? "con prenda" : ""].filter(Boolean).join(" · ") }),
  },
  {
    key: "aguas",
    table: "legal_lvs_aguas",
    pregunta: "tiene_aguas",
    anexo: 5,
    titulo: "Derechos de aprovechamiento de aguas y concesiones",
    singular: "derecho o concesión",
    fields: [
      { name: "clase", label: "Clase", type: "select", span: 4, options: [{ key: "agua", label: "Derecho de aprovechamiento de aguas" }, { key: "concesion", label: "Concesión" }] },
      { name: "numero_resolucion", label: "N.º de resolución", type: "text", span: 4, when: { field: "clase", is: "agua" } },
      { name: "anio_resolucion", label: "Año de resolución", type: "number", span: 4, when: { field: "clase", is: "agua" } },
      { name: "entidad_emisora", label: "Entidad emisora", type: "text", span: 6, when: { field: "clase", is: "agua" } },
      { name: "tipo_derecho", label: "Tipo de derecho", type: "select", span: 3, options: opts(TIPO_DERECHO_AGUA), when: { field: "clase", is: "agua" } },
      { name: "naturaleza", label: "Naturaleza del agua", type: "select", span: 3, options: opts(NATURALEZA_AGUA), when: { field: "clase", is: "agua" } },
      { name: "alveo", label: "Álveo o cauce, si tiene", type: "text", span: 4, when: { field: "clase", is: "agua" } },
      { name: "rol_expediente", label: "Rol del expediente", type: "text", span: 4, when: { field: "clase", is: "agua" } },
      { name: "conservador", label: "Conservador", type: "text", span: 4, when: { field: "clase", is: "agua" } },
      { name: "fojas", label: "Fojas", type: "text", span: 2, when: { field: "clase", is: "agua" } },
      { name: "anio", label: "Año", type: "number", span: 2, when: { field: "clase", is: "agua" } },
      { name: "acto", label: "Acto que la otorga", type: "select", span: 3, options: opts(ACTO_CONCESION), when: { field: "clase", is: "concesion" } },
      { name: "numero", label: "Número", type: "text", span: 3, when: { field: "clase", is: "concesion" } },
      { name: "anio", label: "Año", type: "number", span: 2, when: { field: "clase", is: "concesion" } },
      { name: "servicio_emisor", label: "Servicio emisor", type: "text", span: 4, when: { field: "clase", is: "concesion" } },
      { name: "tipo", label: "Tipo de concesión", type: "text", span: 4, when: { field: "clase", is: "concesion" } },
      { name: "numero_registro", label: "N.º de registro", type: "text", span: 4, when: { field: "clase", is: "concesion" } },
      { name: "anio_registro", label: "Año del registro", type: "number", span: 4, when: { field: "clase", is: "concesion" } },
      ...grav(),
      ...excl,
      obs,
    ],
    resumen: (r) => ({ titulo: r.clase === "concesion" ? `Concesión ${str(r.tipo)} ${str(r.numero)}`.trim() : `Derecho de aguas ${str(r.numero_resolucion)}`.trim(), detalle: [r.clase === "agua" ? TIPO_DERECHO_AGUA[Number(r.tipo_derecho)] : str(r.servicio_emisor), str(r.alveo), str(r.conservador)].filter(Boolean).join(" · ") }),
  },
  {
    key: "participaciones",
    table: "legal_lvs_participaciones",
    pregunta: "tiene_participaciones",
    anexo: 6,
    titulo: "Derechos o acciones en entidades y comunidades hereditarias",
    singular: "participación",
    fields: [
      { name: "clase", label: "Clase", type: "select", span: 4, options: [{ key: "entidad", label: "Participación en sociedad, empresa o comunidad" }, { key: "herencia", label: "Comunidad hereditaria" }] },
      { name: "titulo", label: "Título (código del Anexo 6)", type: "select", span: 4, options: opts(TITULOS_PARTICIPACION) },
      { name: "cantidad_porcentaje", label: "Cantidad o porcentaje", type: "text", span: 4 },
      { name: "razon_social", label: "Nombre o razón social", type: "text", span: 6, when: { field: "clase", is: "entidad" } },
      { name: "rut", label: "RUT", type: "text", span: 3, when: { field: "clase", is: "entidad" } },
      { name: "giro", label: "Giro registrado en el SII", type: "text", span: 3, when: { field: "clase", is: "entidad" } },
      { name: "valor", label: "Valor corriente en plaza o valor libro", type: "money", span: 4, when: { field: "clase", is: "entidad" } },
      { name: "causante_nombre", label: "Nombre del causante", type: "text", span: 5, when: { field: "clase", is: "herencia" } },
      { name: "causante_rut", label: "RUT del causante", type: "text", span: 3, when: { field: "clase", is: "herencia" } },
      { name: "resolucion_exenta", label: "Resolución exenta de posesión efectiva", type: "bool", span: 4, when: { field: "clase", is: "herencia" } },
      { name: "inscripcion_rnt", label: "Inscripción en el Registro de Testamentos", type: "bool", span: 4, when: { field: "clase", is: "herencia" } },
      { name: "valorizacion", label: "Valorización de la cuota o bienes", type: "money", span: 4, when: { field: "clase", is: "herencia" } },
      { name: "fecha_adquisicion", label: "Fecha de adquisición", type: "date", span: 4 },
      ...grav(),
      ...excl,
      obs,
    ],
    resumen: (r) => ({ titulo: r.clase === "herencia" ? `Herencia de ${str(r.causante_nombre) || "causante"}` : str(r.razon_social) || "Participación", detalle: [TITULOS_PARTICIPACION[Number(r.titulo)], str(r.cantidad_porcentaje), money(r.clase === "herencia" ? r.valorizacion : r.valor)].filter(Boolean).join(" · ") }),
  },
  {
    key: "instrumentos",
    table: "legal_lvs_instrumentos",
    pregunta: "tiene_instrumentos",
    anexo: 7,
    titulo: "Valores (instrumentos financieros transables)",
    singular: "instrumento",
    fields: [
      { name: "titulo_codigo", label: "Título o documento (código del Anexo 7)", type: "select", span: 5, options: opts(TITULOS_VALOR) },
      { name: "emisor", label: "Nombre o razón social del emisor", type: "text", span: 7 },
      { name: "fecha_adquisicion", label: "Fecha de adquisición", type: "date", span: 3 },
      { name: "cantidad", label: "Cantidad que representa", type: "text", span: 3 },
      { name: "moneda", label: "Moneda", type: "select", span: 2, options: [{ key: "CLP", label: "CLP" }, { key: "UF", label: "UF" }, { key: "USD", label: "USD" }, { key: "EUR", label: "EUR" }] },
      { name: "valor", label: "Valor corriente en plaza", type: "money", span: 4 },
      ...grav(),
      ...excl,
      obs,
    ],
    resumen: (r) => ({ titulo: `${TITULOS_VALOR[Number(r.titulo_codigo)] ?? "Instrumento"} · ${str(r.emisor)}`.replace(/ · $/, ""), detalle: [str(r.cantidad), money(r.valor), str(r.moneda) !== "CLP" ? str(r.moneda) : ""].filter(Boolean).join(" · ") }),
  },
  {
    key: "muebles",
    table: "legal_lvs_bienes_muebles",
    pregunta: "tiene_bienes_muebles",
    anexo: 8,
    titulo: "Otros bienes muebles y financieros",
    singular: "bien",
    fields: [
      { name: "tipo_codigo", label: "Tipo (código del Anexo 8)", type: "select", span: 5, options: opts(TIPOS_BIEN_MUEBLE) },
      { name: "datos", label: "Datos del bien o de la institución captadora", type: "text", span: 7, placeholder: "juego de living, cuenta de ahorro Banco Estado…" },
      { name: "marca_modelo", label: "Marca / modelo, si corresponde", type: "text", span: 4 },
      { name: "cantidad", label: "Cantidad", type: "text", span: 2 },
      { name: "monto", label: "Monto o valor", type: "money", span: 3 },
      { name: "estado_conservacion", label: "Estado de conservación", type: "text", span: 3 },
      { name: "direccion", label: "Dirección donde se encuentra, si corresponde", type: "text", span: 12, placeholder: "por defecto, el domicilio del cliente" },
      ...grav(),
      ...excl,
      obs,
    ],
    resumen: (r) => ({ titulo: str(r.datos) || TIPOS_BIEN_MUEBLE[Number(r.tipo_codigo)] || "Bien", detalle: [TIPOS_BIEN_MUEBLE[Number(r.tipo_codigo)], str(r.cantidad) ? `x${str(r.cantidad)}` : "", money(r.monto), r.excluido ? "excluido" : ""].filter(Boolean).join(" · ") }),
  },
  {
    key: "juicios",
    table: "legal_lvs_juicios",
    pregunta: "tiene_juicios",
    titulo: "Juicios pendientes",
    singular: "juicio",
    fields: [
      { name: "rol", label: "Rol de la causa", type: "text", span: 3, placeholder: "C-1234-2025" },
      { name: "tribunal", label: "Tribunal", type: "text", span: 5 },
      { name: "corte", label: "Corte de Apelaciones", type: "text", span: 4 },
      { name: "caratula", label: "Carátula", type: "text", span: 8 },
      { name: "calidad", label: "Calidad del cliente", type: "select", span: 4, options: CALIDADES_JUICIO.map((c) => ({ key: c, label: c })) },
      { name: "estado", label: "Estado actual del juicio", type: "text", span: 8, placeholder: "en tramitación, cumplimiento incidental, ejecutivo…" },
      { name: "monto", label: "Monto demandado", type: "money", span: 4 },
      { name: "puede_ingreso", label: "Puede producir ingreso de dinero", type: "bool", span: 6 },
      { name: "puede_desembolso", label: "Puede producir desembolso", type: "bool", span: 6 },
      obs,
    ],
    resumen: (r) => ({ titulo: [str(r.rol), str(r.caratula)].filter(Boolean).join(" · ") || "Juicio", detalle: [str(r.tribunal), str(r.calidad), str(r.estado), money(r.monto)].filter(Boolean).join(" · ") }),
  },
];

export const categoria = (key: string) => CATEGORIAS.find((c) => c.key === key) ?? null;

/** Lo que el estudio repite en cada fila del Anexo 8 cuando el deudor solo da el nombre del bien. */
export const MUEBLE_DEFAULTS = { cantidad: "1", estado_conservacion: "Regular", observaciones: "Sin observaciones" } as const;

// Palabras que delatan el tipo del Anexo 8 (minúsculas, sin tildes). Orden: lo más específico primero.
const PISTAS: [number, string[]][] = [
  [19, ["afp", "cuenta 2", "cuenta dos"]],
  [16, ["cuenta de ahorro", "cuenta ahorro", "ahorro vivienda", "cuenta rut"]],
  [18, ["cuenta corriente", "cuenta vista", "saldo"]],
  [20, ["libreta"]],
  [21, ["seguro"]],
  [15, ["cripto", "bitcoin", "ethereum", "usdt"]],
  [22, ["efectivo", "dinero"]],
  [17, ["factura"]],
  [14, ["joya", "anillo", "collar", "pulsera", "aro", "reloj de oro", "oro"]],
  [13, ["bicicleta", "bici", "scooter", "trotadora", "caminadora", "maquina de ejercicio", "elíptica", "eliptica", "mancuerna"]],
  [6, ["notebook", "computador", "laptop", "pc ", "monitor", "impresora", "teclado", "mouse", "disco duro"]],
  [8, ["televisor", "tv", "smart tv", "parlante", "consola", "playstation", "xbox", "nintendo", "celular", "telefono", "tablet", "ipad", "camara", "equipo de musica", "audifono", "smartwatch", "proyector"]],
  [7, ["cafetera", "plancha", "hervidor", "microondas", "refrigerador", "refri", "lavadora", "secadora", "horno", "licuadora", "aspiradora", "estufa", "ventilador", "tostador", "batidora", "freidora", "minipimer", "calefactor", "secador", "cocina", "lavavajilla", "congelador", "jugera", "sanduchera", "wafflera", "termo", "calefon", "aire acondicionado"]],
  [5, ["escritorio", "silla de oficina", "archivador"]],
  [3, ["taladro", "esmeril", "sierra", "herramienta", "atornillador", "compresor", "soldadora"]],
  [2, ["maquina", "máquina", "equipo"]],
  [11, ["cuadro", "pintura", "obra de arte", "escultura"]],
  [1, ["cama", "colchon", "sofa", "sillon", "living", "comedor", "mesa", "silla", "velador", "closet", "ropero", "comoda", "estante", "rack", "mueble", "lampara", "alfombra", "cortina", "vajilla", "olla", "juego de"]],
];
const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Tipo probable del Anexo 8 para un nombre de bien («cafetera» → 7, «notebook» → 6); null si no hay pista. */
export function sugerirTipoMueble(texto: string): number | null {
  const t = ` ${plain(texto)} `;
  for (const [codigo, palabras] of PISTAS) if (palabras.some((p) => t.includes(plain(p)))) return codigo;
  return null;
}
export type BienesPorCategoria = Record<BienCategoriaKey, BienRow[]>;
export const EMPTY_BIENES: BienesPorCategoria = { raices: [], vehiculos: [], aguas: [], participaciones: [], instrumentos: [], muebles: [], juicios: [] };

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { LegalClient } from "./data";
import { renderDocx } from "./docx";
import { TEXTO_SEGUN_GENERO } from "./lvs";
import { TEXTO_FIJO_DEMANDA } from "./lvs-demanda";
import type { LvsFicha } from "./lvs";
import { CATEGORIAS, TIPOS_BIEN_MUEBLE, type BienCategoriaKey, type BienRow } from "./lvs-bienes";
import { totalDeudas, type Deuda } from "./lvs-acreedores";
import { lvsValues } from "./lvs";
import { clientValues } from "./templates";
import { DOCX_MIME, TEMPLATE_BUCKET } from "./templates";
import { formatRut } from "./rut";

import { ANEXO_CATEGORIA, GENERADOS, type GeneradoTipo } from "./lvs-generados";
export { GENERADOS, type GeneradoTipo, type LvsGenerado } from "./lvs-generados";

const pesos = (v: unknown) => (typeof v === "number" ? `$ ${v.toLocaleString("es-CL")}` : "");
const siNo = (v: unknown) => (v ? "SI" : "NO");
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().replace(/\s+/g, "-");

/** Datos del Anexo 8 a partir de la ficha y los bienes muebles. Errores = no se puede generar; advertencias = se genera igual. */
/**
 * Bienes que van SIEMPRE en el Anexo 8 como excluidos (inembargables), sin cargarlos en la ficha: el estudio los pone en
 * toda nómina (2026-10-06). Van al final, después de los bienes que el operador haya cargado.
 */
export const BIENES_EXCLUIDOS_FIJOS: BienRow[] = (
  [
    ["CAMA DE 2 PLAZAS", 1],
    ["REFRIGERADOR", 7],
    ["LAVADORA", 7],
    ["COMEDOR", 1],
  ] as const
).map(([datos, tipo], i) => ({
  id: `fijo-${i + 1}`,
  tipo_codigo: tipo,
  datos,
  marca_modelo: "SIN INFORMAR",
  cantidad: "1",
  monto: null,
  estado_conservacion: "REGULAR",
  direccion: null,
  // En la columna «Excluido» va solo «SI»; el fundamento va en «Observaciones» (así lo pide el estudio)
  excluido: true,
  motivo_exclusion: null,
  gravamen: false,
  gravamen_detalle: null,
  observaciones: "Bien inembargable (art. 445 del Código de Procedimiento Civil)",
})) as unknown as BienRow[];

export function datosAnexo8(c: LegalClient, f: LvsFicha, cargados: BienRow[], lawyer: string | null) {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!c.full_name?.trim()) errores.push("Falta el nombre del cliente.");
  if (!c.rut) errores.push("Falta el RUT del cliente.");
  // Con los cuatro bienes excluidos fijos, el Anexo 8 siempre tiene contenido: se genera aunque la ficha no declare más.
  // Orden: primero lo que cargó el operador, al final los excluidos fijos (así lo quiere el estudio)
  const bienes = [...cargados, ...BIENES_EXCLUIDOS_FIJOS];
  cargados.forEach((b, i) => {
    if (!b.tipo_codigo) errores.push(`Bien ${i + 1}: falta el tipo (código del Anexo 8).`);
    if (!b.datos) advertencias.push(`Bien ${i + 1}: sin descripción («Datos del bien»).`);
    if (b.monto == null) advertencias.push(`Bien ${i + 1}: sin monto o valor.`);
  });
  const data = {
    ...clientValues(c, lawyer),
    ...lvsValues(f),
    bienes: bienes.map((b) => ({
      tipo: b.tipo_codigo ? `${b.tipo_codigo}` : "",
      tipo_nombre: b.tipo_codigo ? (TIPOS_BIEN_MUEBLE[Number(b.tipo_codigo)] ?? "") : "",
      datos: String(b.datos ?? ""),
      marca_modelo: String(b.marca_modelo ?? ""),
      cantidad: String(b.cantidad ?? ""),
      monto: pesos(b.monto),
      estado_conservacion: String(b.estado_conservacion ?? ""),
      direccion: String(b.direccion ?? f.domicilio ?? ""),
      excluido: siNo(b.excluido) + (b.excluido && b.motivo_exclusion ? ` · ${b.motivo_exclusion}` : ""),
      gravamen: siNo(b.gravamen) + (b.gravamen && b.gravamen_detalle ? ` · ${b.gravamen_detalle}` : ""),
      observaciones: String(b.observaciones ?? ""),
    })),
  };
  return { data, errores, advertencias };
}

/* ---------- Anexos de bienes 3 a 7 ---------- */
const str = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("es-CL") : "");
const fecha = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es-CL", { timeZone: "UTC" });
};
/** «SI · detalle» o «NO»: así piden los anexos los gravámenes y la exclusión. */
const siNoDetalle = (v: unknown, detalle: unknown) => siNo(v) + (v && detalle ? ` · ${String(detalle)}` : "");
const excl = (r: BienRow) => siNoDetalle(r.excluido, r.motivo_exclusion);
const grav = (r: BienRow) => siNoDetalle(r.gravamen, r.gravamen_detalle);

type Fila = (r: BienRow, i: number) => Record<string, string>;
type Lista = { nombre: string; filtro?: (r: BienRow) => boolean; fila: Fila };

/** Para cada anexo de bienes: qué listas lleva (una por tabla del Word) y cómo se arma cada fila desde la ficha. */
const LISTAS_ANEXOS: Record<"anexo3" | "anexo4" | "anexo5" | "anexo6" | "anexo7", Lista[]> = {
  anexo3: [
    {
      nombre: "raices",
      fila: (r, i) => ({
        id: String(i + 1),
        descripcion: str(r.descripcion),
        direccion: [r.direccion, r.comuna, r.region].map(str).filter(Boolean).join(", "),
        rol_avaluo: str(r.rol_avaluo),
        numero_inscripcion: str(r.numero_inscripcion),
        fojas: str(r.fojas),
        anio: str(r.anio),
        conservador: str(r.conservador),
        avaluo_fiscal: pesos(r.avaluo_fiscal),
        tipo: str(r.tipo),
        hipoteca: siNoDetalle(r.hipoteca, r.hipoteca_detalle),
        valor_comercial: pesos(r.valor_comercial),
        clase_propiedad: str(r.clase_propiedad),
        excluido: excl(r),
        observaciones: str(r.observaciones),
      }),
    },
  ],
  anexo4: [
    {
      nombre: "vehiculos",
      fila: (r, i) => ({
        id: String(i + 1),
        tipo: str(r.tipo_codigo),
        descripcion: str(r.descripcion),
        patente: str(r.patente),
        numero_inscripcion: str(r.numero_inscripcion),
        marca: str(r.marca),
        modelo: str(r.modelo),
        anio: str(r.anio),
        avaluo_fiscal: pesos(r.avaluo_fiscal),
        tasacion: pesos(r.tasacion),
        estado: str(r.estado),
        gravamen: grav(r),
        excluido: excl(r),
        observaciones: str(r.observaciones),
      }),
    },
  ],
  anexo5: [
    {
      nombre: "aguas",
      filtro: (r) => r.clase !== "concesion",
      fila: (r) => ({
        numero_resolucion: str(r.numero_resolucion),
        anio_resolucion: str(r.anio_resolucion),
        entidad_emisora: str(r.entidad_emisora),
        tipo_derecho: str(r.tipo_derecho),
        naturaleza: str(r.naturaleza),
        alveo: str(r.alveo),
        rol_expediente: str(r.rol_expediente),
        conservador: str(r.conservador),
        fojas: str(r.fojas),
        anio: str(r.anio),
        gravamen: grav(r),
        excluido: excl(r),
        observaciones: str(r.observaciones),
      }),
    },
    {
      nombre: "concesiones",
      filtro: (r) => r.clase === "concesion",
      fila: (r) => ({
        acto: str(r.acto),
        numero: str(r.numero),
        anio: str(r.anio),
        servicio_emisor: str(r.servicio_emisor),
        tipo: str(r.tipo),
        numero_registro: str(r.numero_registro),
        anio_registro: str(r.anio_registro),
        gravamen: grav(r),
        excluido: excl(r),
        observaciones: str(r.observaciones),
      }),
    },
  ],
  anexo6: [
    {
      nombre: "entidades",
      filtro: (r) => r.clase !== "herencia",
      fila: (r) => ({
        titulo: str(r.titulo),
        cantidad_porcentaje: str(r.cantidad_porcentaje),
        razon_social: str(r.razon_social),
        rut: r.rut ? formatRut(String(r.rut)) : "",
        giro: str(r.giro),
        fecha_adquisicion: fecha(r.fecha_adquisicion),
        valor: pesos(r.valor),
        gravamen: grav(r),
        excluido: excl(r),
        observaciones: str(r.observaciones),
      }),
    },
    {
      nombre: "herencias",
      filtro: (r) => r.clase === "herencia",
      fila: (r) => ({
        titulo: str(r.titulo),
        cantidad_porcentaje: str(r.cantidad_porcentaje),
        causante: [str(r.causante_nombre), r.causante_rut ? formatRut(String(r.causante_rut)) : ""].filter(Boolean).join(" · "),
        resolucion_exenta: siNo(r.resolucion_exenta),
        inscripcion_rnt: siNo(r.inscripcion_rnt),
        fecha_adquisicion: fecha(r.fecha_adquisicion),
        valorizacion: pesos(r.valorizacion),
        gravamen: grav(r),
        excluido: excl(r),
        observaciones: str(r.observaciones),
      }),
    },
  ],
  anexo7: [
    {
      nombre: "valores",
      fila: (r) => ({
        titulo: str(r.titulo_codigo),
        emisor: str(r.emisor),
        fecha_adquisicion: fecha(r.fecha_adquisicion),
        cantidad: str(r.cantidad),
        moneda: str(r.moneda),
        valor: num(r.valor),
        excluido: excl(r),
        gravamen: grav(r),
        observaciones: str(r.observaciones),
      }),
    },
  ],
};

/** Datos de un anexo de bienes (3 a 7) desde la ficha y los bienes de su categoría. */
export function datosAnexoBienes(tipo: keyof typeof LISTAS_ANEXOS, c: LegalClient, f: LvsFicha, rows: BienRow[], lawyer: string | null) {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const cat = CATEGORIAS.find((x) => x.key === ANEXO_CATEGORIA[tipo])!;
  if (!c.full_name?.trim()) errores.push("Falta el nombre del cliente.");
  if (!c.rut) errores.push("Falta el RUT del cliente.");
  if (f[cat.pregunta] !== true) errores.push(`La ficha no declara ${cat.titulo.toLowerCase()} (art. 273 A n.º 1).`);
  if (rows.length === 0) errores.push(`No hay ${cat.titulo.toLowerCase()} cargados en la ficha.`);
  const listas: Record<string, Record<string, string>[]> = {};
  for (const l of LISTAS_ANEXOS[tipo]) listas[l.nombre] = rows.filter((r) => !l.filtro || l.filtro(r)).map((r, i) => l.fila(r, i));
  rows.forEach((r, i) => {
    if (r.excluido && !r.motivo_exclusion) advertencias.push(`${cat.singular} ${i + 1}: marcado como excluido sin motivo legal.`);
    if (r.gravamen && !r.gravamen_detalle) advertencias.push(`${cat.singular} ${i + 1}: con gravamen sin detalle.`);
  });
  const data = { ...clientValues(c, lawyer), ...lvsValues(f), ...listas };
  return { data, errores, advertencias };
}

/** Datos del Anexo 9: una fila por deuda con lo que pide el formulario y el total calculado. */
export function datosAnexo9(c: LegalClient, f: LvsFicha, deudas: Deuda[], lawyer: string | null) {
  const errores: string[] = [];
  const advertencias: string[] = [];
  if (!c.full_name?.trim()) errores.push("Falta el nombre del cliente.");
  if (!c.rut) errores.push("Falta el RUT del cliente.");
  if (deudas.length === 0) errores.push("No hay deudas cargadas en la ficha (bloque Acreedores).");
  deudas.forEach((d, i) => {
    if (d.monto == null) errores.push(`Deuda ${i + 1} (${d.nombre}): falta el monto.`);
    if (!d.rut) advertencias.push(`${d.nombre}: sin RUT.`);
    if (!d.email && !d.telefono) advertencias.push(`${d.nombre}: sin correo ni teléfono.`);
  });
  const data = {
    ...clientValues(c, lawyer),
    ...lvsValues(f),
    deudas: deudas.map((d) => ({
      rut: d.rut ? formatRut(d.rut) : "",
      acreedor: d.nombre,
      monto: pesos(d.monto),
      correo: d.email ?? "",
      telefono: d.telefono ?? "",
      naturaleza: d.naturaleza,
    })),
    total: pesos(totalDeudas(deudas)),
  };
  return { data, errores, advertencias };
}

/** Anexos en los que hay bienes marcados como excluidos, como texto para la demanda («el Anexo N.º 8», «los Anexos N.º 3 y 8»). */
function anexosConExcluidos(porCategoria: Partial<Record<BienCategoriaKey, BienRow[]>>): string {
  const nums = CATEGORIAS.filter((cat) => cat.anexo && (porCategoria[cat.key] ?? []).some((r) => r.excluido)).map((cat) => cat.anexo as number);
  if (nums.length === 0) return "";
  if (nums.length === 1) return `el Anexo N.º ${nums[0]}`;
  return `los Anexos N.º ${nums.slice(0, -1).join(", ")} y ${nums[nums.length - 1]}`;
}

/**
 * Datos de la Solicitud LVS: variables de la ficha, banderas para los bloques condicionales y listas (juicios,
 * inmuebles y vehículos para los certificados del segundo otrosí). Sin alguno de los datos base no se genera.
 */
export function datosDemanda(c: LegalClient, f: LvsFicha, porCategoria: Partial<Record<BienCategoriaKey, BienRow[]>>, lawyer: string | null) {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const falta = (ok: unknown, que: string) => {
    if (!ok) errores.push(`Falta ${que} en la ficha.`);
  };
  falta(c.full_name?.trim(), "el nombre");
  falta(c.rut, "el RUT");
  falta(f.genero, "el género");
  falta(f.nacionalidad, "la nacionalidad");
  falta(f.estado_civil, "el estado civil");
  falta(f.profesion_oficio, "la profesión u oficio");
  falta(f.domicilio, "el domicilio");
  falta(f.comuna, "la comuna");
  falta(f.region, "la región");
  falta(f.sj_comuna, "el tribunal (S.J.L.)");
  falta(f.carta_demanda?.trim(), "la carta de insolvencia (versión para la demanda)");
  falta(f.relacion_laboral != null, "la situación laboral");
  if (f.relacion_laboral === true && !f.empleador) errores.push("Falta el empleador en la ficha.");
  for (const cat of CATEGORIAS) {
    if (f[cat.pregunta] == null) errores.push(`Falta responder «${cat.titulo}» en la ficha.`);
    else if (f[cat.pregunta] === true && (porCategoria[cat.key] ?? []).length === 0) advertencias.push(`${cat.titulo}: la ficha marca «Sí» pero no hay elementos cargados.`);
  }
  const rows = (k: BienCategoriaKey) => porCategoria[k] ?? [];
  const excluidos = anexosConExcluidos(porCategoria);
  const data = {
    ...clientValues(c, lawyer),
    ...lvsValues(f),
    tiene_bienes_raices: f.tiene_bienes_raices === true,
    tiene_vehiculos: f.tiene_vehiculos === true,
    tiene_aguas: f.tiene_aguas === true,
    tiene_participaciones: f.tiene_participaciones === true,
    tiene_instrumentos: f.tiene_instrumentos === true,
    tiene_bienes_muebles: f.tiene_bienes_muebles === true,
    tiene_juicios: f.tiene_juicios === true && rows("juicios").length > 0,
    trabaja: f.relacion_laboral === true,
    empleador: f.empleador ?? "",
    soltero: f.estado_civil === "Soltero/a",
    casado: f.estado_civil === "Casado/a",
    tiene_excluidos: excluidos !== "",
    anexos_excluidos: excluidos,
    raices: rows("raices").map((r) => ({ descripcion: str(r.descripcion) || "singularizado en el Anexo N.º 3", conservador: str(r.conservador) || "Conservador de Bienes Raíces competente" })),
    vehiculos: rows("vehiculos").map((r) => ({ patente: str(r.patente) })),
    juicios: rows("juicios").map((j) => ({ rol: str(j.rol), tribunal: str(j.tribunal), corte: str(j.corte), caratula: str(j.caratula), calidad: str(j.calidad), estado: str(j.estado), monto: pesos(j.monto) })),
  };
  return { data, errores, advertencias };
}

/** Datos de la Declaración 273-A: todo sale de la ficha; sin alguno de estos no se genera. */
export function datosDeclaracion(c: LegalClient, f: LvsFicha, lawyer: string | null) {
  const errores: string[] = [];
  const falta = (ok: unknown, que: string) => {
    if (!ok) errores.push(`Falta ${que} en la ficha.`);
  };
  falta(c.full_name?.trim(), "el nombre");
  falta(c.rut, "el RUT");
  falta(f.genero, "el género (don/doña, domiciliado/a)");
  falta(f.profesion_oficio, "la profesión u oficio");
  falta(f.nacionalidad, "la nacionalidad");
  falta(f.estado_civil, "el estado civil");
  falta(f.domicilio, "el domicilio");
  falta(f.comuna, "la comuna");
  falta(f.region, "la región");
  // Anexos que acompañan la solicitud: 8, 9 y 11 siempre; 3 a 7 según cada «Sí» del patrimonio
  const porCategoria = [f.tiene_bienes_raices, f.tiene_vehiculos, f.tiene_aguas, f.tiene_participaciones, f.tiene_instrumentos].filter(Boolean).length;
  const data = { ...clientValues(c, lawyer), ...lvsValues(f), cantidad_anexos: String(3 + porCategoria) };
  return { data, errores, advertencias: [] as string[] };
}

/**
 * Genera un documento LVS: toma la plantilla del slot, la rellena, guarda el Word en el bucket de documentos de la
 * causa, lo registra como documento (y como generado).
 * Si ya había una versión, la anterior pasa a «reemplazado».
 */
export async function generarDocumento(supabase: SupabaseClient, userId: string, c: LegalClient, tipo: GeneradoTipo, data: Record<string, unknown>, advertencias: string[]): Promise<{ error?: string; id?: string }> {
  const { data: tpl } = await supabase.from("legal_templates").select("id, version, storage_path, name").eq("slot", tipo).eq("active", true).maybeSingle();
  if (!tpl) return { error: `No hay plantilla cargada para «${GENERADOS[tipo].nombre}». Súbela en Plantillas con el papel ${tipo}.` };
  const dl = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.storage_path);
  if (dl.error || !dl.data) return { error: `No se pudo leer la plantilla: ${dl.error?.message ?? "sin archivo"}` };
  let out: Buffer;
  try {
    out = renderDocx(Buffer.from(await dl.data.arrayBuffer()), data, { textoFijo: [...TEXTO_SEGUN_GENERO, ...TEXTO_FIJO_DEMANDA] });
  } catch (e) {
    return { error: `La plantilla no se pudo rellenar: ${(e as Error).message}` };
  }
  const fileName = `${GENERADOS[tipo].nombre.split(" · ")[0]} - ${slug(c.full_name)}${c.rut ? ` ${formatRut(c.rut)}` : ""}.docx`;
  const path = `${c.id}/generados/${randomUUID()}.docx`;
  const up = await supabase.storage.from("legal-documents").upload(path, out, { contentType: DOCX_MIME, cacheControl: "0", upsert: false });
  if (up.error) return { error: `No se pudo guardar el Word: ${up.error.message}` };

  const { data: prev } = await supabase.from("legal_lvs_generados").select("id, document_id").eq("client_id", c.id).eq("tipo", tipo).neq("estado", "reemplazado").order("generado_at", { ascending: false }).limit(1).maybeSingle();
  const { data: doc, error: docErr } = await supabase
    .from("legal_documents")
    .insert({ client_id: c.id, name: GENERADOS[tipo].nombre, doc_type: tipo, status: "preparado", storage_path: path, file_size: out.length, mime: DOCX_MIME, version: 1, replaces_id: prev?.document_id ?? null })
    .select("id")
    .single();
  if (docErr) return { error: docErr.message };
  const { data: gen, error } = await supabase
    .from("legal_lvs_generados")
    .insert({ client_id: c.id, tipo, template_id: tpl.id, template_version: tpl.version, document_id: doc.id, storage_path: path, file_name: fileName, replaces_id: prev?.id ?? null, datos: data, advertencias, generado_por: userId })
    .select("id")
    .single();
  if (error) return { error: error.message };
  if (prev) {
    await supabase.from("legal_lvs_generados").update({ estado: "reemplazado" }).eq("id", prev.id);
    if (prev.document_id) await supabase.from("legal_documents").update({ is_current: false, status: "reemplazado" }).eq("id", prev.document_id);
  }
  return { id: gen.id as string };
}

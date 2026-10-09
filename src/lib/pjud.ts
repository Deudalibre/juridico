/**
 * Cliente de la Oficina Judicial Virtual del Poder Judicial de Chile (consulta unificada de causas), competencia civil.
 *
 * Portado a TypeScript desde el cliente open source mcp-pjud-cl (github.com/notluquis/mcp-pjud-cl), con sus mismas
 * reglas de trato a la institución:
 *  - una consulta cada 5 segundos en régimen sostenido, con ráfaga máxima de 4 (cláusula cuarta de las condiciones de
 *    uso de la OJV);
 *  - User-Agent identificable con correo de contacto;
 *  - detención total ante 403, 429, un desafío del cortafuegos (F5 BIG-IP APM) o un aviso de captcha: no se reintenta
 *    ni se evade, y la instancia queda bloqueada hasta que una persona revise.
 *
 * Flujo (medido por ese proyecto contra el sistema real): abrir sesión pública (dos GET que fijan la cookie y entregan
 * el prefijo de rutas `ADIR_n` y el token de los modales), buscar por rol (POST civil/consultaRitCivil.php), abrir el
 * detalle (POST civil/modal/causaCivil.php con la referencia opaca de la fila) y recorrer todos los cuadernos, porque
 * el detalle despliega la Historia de uno solo. Corre en el servidor (cron y acción «Sincronizar ahora»).
 */
import * as cheerio from "cheerio";

export const PJUD_BASE = "https://oficinajudicialvirtual.pjud.cl";
const ENTRADA = `${PJUD_BASE}/includes/sesion-consultaunificada.php`;
const PORTADA = "https://www.pjud.cl/";
/** Segundos entre consultas en régimen sostenido (cláusula cuarta). No se baja. */
export const INTERVALO_MINIMO_MS = 5000;
/** Consultas que pueden salir seguidas antes de empezar a esperar. */
export const RAFAGA_MAXIMA = 4;
const ESPERA_MAXIMA_MS = 60_000;
const COMPETENCIA_CIVIL = 3;
const MARCA_APM = "APM_DO_NOT_TOUCH";
const SENAL_CAPTCHA = ["captcha", "recaptcha", "no soy un robot", "verificaci"];
const SIN_RESULTADOS = "No se han encontrado resultados";

export class PjudBloqueado extends Error {}
export class PjudNoRespondio extends Error {}
export class CausaNoEncontrada extends Error {}
export class EstructuraInesperada extends Error {}

export type Corte = { codigo: number; nombre: string };
export type Tribunal = { codigo: number; nombre: string; corte: number };
export type CausaEncontrada = { referencia: string; rol: string; fecha_ingreso: string; caratulado: string; tribunal: string };
/** `sujeto` es la calidad tal como la publica la OJV («DDOR.», «AB.DDO», «ACRDOR», «LIQUID», «DTE.», «DDO.»…); `tipo` la interpreta. */
export type ParteTipo = "demandante" | "demandado" | "deudor" | "acreedor" | "liquidador" | "abogado_demandante" | "abogado_demandado" | "abogado_deudor" | "abogado_acreedor" | "otro";
export type Parte = { tipo: ParteTipo; sujeto: string; nombre: string; rut: string; persona: string };
/** `folio` va nulo en las filas que el sitio publica sin folio (en civil las hay, p. ej. «Poder acreditado»). */
/**
 * Documento descargable de la OJV: un `<form method="get" action="ADIR_n/civil/documentos/x.php">` con un único input
 * cuyo valor es un JWT que vence a la hora. Se baja por GET `${PJUD_BASE}/${action}?${param}=${token}` sin cookies.
 * En la columna «Doc.» hay uno o dos formularios: `doc_*` el documento (docuS.php en resoluciones, docuN.php en escritos)
 * y, en los escritos, `cert_*` el certificado de envío (docCertificadoEscrito.php). La columna «Anexo» no trae formulario
 * sino una carpeta `anexoSolicitudCivil('ref')` que abre otra lista de PDFs: `anexo_ref` es esa referencia (se lee con
 * PjudClient.anexosSolicitud) y `tiene_anexo` queda en la base aunque la referencia se descarte.
 */
export type Actuacion = {
  folio: number | null;
  etapa: string;
  tramite: string;
  descripcion: string;
  fecha_diligencia: string | null;
  fecha_registro: string | null;
  foja: string | null;
  tiene_documento: boolean;
  doc_action: string | null;
  doc_param: string | null;
  doc_token: string | null;
  cert_action: string | null;
  cert_param: string | null;
  cert_token: string | null;
  tiene_anexo: boolean;
  anexo_ref: string | null;
};
export type Cuaderno = { nombre: string; actuaciones: Actuacion[] };
/** Formulario de descarga tal como viene en el HTML (action relativo a PJUD_BASE, nombre del input y su JWT). */
export type FormularioDoc = { action: string; param: string; token: string };
/** Una fila de las ventanas «Anexo Solicitud» / «Anexo de la Causa»: PDF (anexoDocCivil.php) con fecha y referencia. */
export type AnexoDoc = FormularioDoc & { fecha: string | null; referencia: string };
export type DetalleCausa = {
  rol: string;
  tribunal: string;
  caratulado: string;
  fecha_ingreso: string | null;
  estado_adm: string;
  estado_proc: string;
  procedimiento: string;
  etapa: string;
  ubicacion: string;
  partes: Parte[];
  cuadernos: Cuaderno[];
  /** Documentos de la cabecera: Texto demanda (docu.php), Certificado de envío (docCertificadoDemanda.php), Ebook (newebookcivil.php). */
  demanda_action: string | null;
  demanda_param: string | null;
  demanda_token: string | null;
  cert_demanda_action: string | null;
  cert_demanda_param: string | null;
  cert_demanda_token: string | null;
  ebook_action: string | null;
  ebook_param: string | null;
  ebook_token: string | null;
  /** «Anexos de la causa» (carpeta de la cabecera, `anexoCausaCivil('ref')`): se leen con PjudClient.anexosCausa. */
  tiene_anexos_causa: boolean;
  anexos_causa_ref: string | null;
  /** Cuántas peticiones costó, para la bitácora. */
  peticiones: number;
};

/** URL de descarga de un documento (GET, sin cookies; el JWT basta y vence a la hora de abrir el detalle). */
export const urlDocumento = (action: string, param: string, token: string) => `${PJUD_BASE}/${action.replace(/^\/+/, "")}?${encodeURIComponent(param)}=${encodeURIComponent(token)}`;

const texto = (s: string) => s.replace(/\s+/g, " ").trim();
/** «22/06/2026» → «2026-06-22»; las fechas centinela (31/12/1969, 01/01/1970) van en nulo. */
const fechaIso = (txt: string | null | undefined): string | null => {
  const m = (txt ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [d, mes] = [Number(m[1]), Number(m[2])];
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return iso === "1969-12-31" || iso === "1970-01-01" ? null : iso;
};

/** Para comparar nombres de tribunal escritos de distintas formas: «1º», «1o», «1°», tildes, mayúsculas, «Gar.de». */
export function normalizarTribunal(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\d+)\s*(?:º|°|ª|o\b|a\b|er\b|do\b|to\b)\.?/g, "$1")
    .replace(/[.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Calidades medidas en causas civiles y de liquidación: DTE./DDO. (juicio), DDOR. (deudor), ACRDOR (acreedor), LIQUID (liquidador), AB.xxx (su abogado). */
const SUJETO_A_TIPO = (sujeto: string): ParteTipo => {
  const s = sujeto.toUpperCase().replace(/[\s.]/g, "");
  if (s.startsWith("ABDTE")) return "abogado_demandante";
  if (s.startsWith("ABDDOR")) return "abogado_deudor";
  if (s.startsWith("ABDDO")) return "abogado_demandado";
  if (s.startsWith("ABACR")) return "abogado_acreedor";
  if (s.startsWith("DTE")) return "demandante";
  if (s.startsWith("DDOR")) return "deudor";
  if (s.startsWith("DDO")) return "demandado";
  if (s.startsWith("ACR")) return "acreedor";
  if (s.startsWith("LIQ")) return "liquidador";
  return "otro";
};

export class PjudClient {
  private cookies = new Map<string, string>();
  private adir: string | null = null;
  private token: string | null = null;
  private fichas = RAFAGA_MAXIMA;
  private ultima = 0;
  private bloqueado: string | null = null;
  /** Bitácora de peticiones: método, URL, estado y milisegundos, para acreditar cuánto se consultó. */
  readonly bitacora: { metodo: string; url: string; estado: number; ms: number; durmio: number }[] = [];

  constructor(private readonly contacto: string, private readonly intervaloMs = INTERVALO_MINIMO_MS) {
    if (intervaloMs < INTERVALO_MINIMO_MS) throw new Error(`El intervalo mínimo entre consultas es ${INTERVALO_MINIMO_MS / 1000}s (condiciones de uso de la OJV).`);
  }

  /* ---------- transporte: ritmo, cookies, detención ---------- */

  private async esperar(): Promise<number> {
    const ahora = Date.now();
    if (this.ultima) this.fichas = Math.min(RAFAGA_MAXIMA, this.fichas + (ahora - this.ultima) / this.intervaloMs);
    if (this.fichas < 1) {
      const dormir = Math.ceil((1 - this.fichas) * this.intervaloMs);
      await new Promise((r) => setTimeout(r, dormir));
      this.fichas = 0;
      return dormir;
    }
    this.fichas -= 1;
    return 0;
  }

  private cookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  private guardarCookies(res: Response) {
    const lista = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of lista) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      if (i > 0) this.cookies.set(par.slice(0, i).trim(), par.slice(i + 1).trim());
    }
  }

  private async req(metodo: "GET" | "POST", url: string, opciones: { headers?: Record<string, string>; form?: Record<string, string> } = {}): Promise<{ status: number; text: string; contentType: string }> {
    if (this.bloqueado) throw new PjudBloqueado(this.bloqueado);
    const durmio = await this.esperar();
    const headers: Record<string, string> = {
      "User-Agent": `deudalibre-juridico/1.0 (+contacto: ${this.contacto})`,
      "Accept-Language": "es-CL,es;q=0.9",
      ...(opciones.headers ?? {}),
    };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    let body: string | undefined;
    if (opciones.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(opciones.form).toString();
    }
    const t0 = Date.now();
    let res: Response;
    let destino = url;
    try {
      // Redirecciones a mano para conservar las cookies que el cortafuegos fija en el camino
      for (let salto = 0; ; salto++) {
        res = await fetch(destino, { method: salto === 0 ? metodo : "GET", headers: salto === 0 ? headers : { ...headers, "Content-Type": "" }, body: salto === 0 ? body : undefined, redirect: "manual", signal: AbortSignal.timeout(ESPERA_MAXIMA_MS) });
        this.guardarCookies(res);
        if (res.status >= 300 && res.status < 400 && res.headers.get("location") && salto < 5) {
          destino = new URL(res.headers.get("location")!, destino).toString();
          headers.Cookie = this.cookieHeader();
          continue;
        }
        break;
      }
    } catch (e) {
      this.ultima = Date.now();
      this.bitacora.push({ metodo, url, estado: 0, ms: Date.now() - t0, durmio });
      const nombre = (e as Error).name;
      if (nombre === "TimeoutError" || nombre === "AbortError") throw new PjudNoRespondio(`${url} no respondió en ${ESPERA_MAXIMA_MS / 1000} segundos. La petición sí salió. Se puede reintentar más tarde respetando el intervalo.`);
      this.bloqueado = `La conexión con ${url} se cortó (${nombre}: ${(e as Error).message}). No se distingue un corte de red de un rechazo del cortafuegos: detención total, revisar antes de reintentar.`;
      throw new PjudBloqueado(this.bloqueado);
    }
    this.ultima = Date.now();
    const text = await res!.text();
    this.bitacora.push({ metodo, url, estado: res!.status, ms: Date.now() - t0, durmio });
    if (res!.status === 403 || res!.status === 429) {
      this.bloqueado = `El Poder Judicial respondió ${res!.status} a ${url}. Detención total: no se reintenta ni se evade. Revisar si la IP quedó bloqueada.`;
      throw new PjudBloqueado(this.bloqueado);
    }
    if (text.slice(0, 4000).includes(MARCA_APM)) {
      this.bloqueado = `El cortafuegos interpuso un desafío de F5 BIG-IP APM en ${url} (HTTP 200). Resolverlo exige ejecutar su JavaScript, es decir sortear un control anti-automatización, y eso no se hace. Detención total.`;
      throw new PjudBloqueado(this.bloqueado);
    }
    const aviso = leerAviso(text);
    if (aviso && SENAL_CAPTCHA.some((s) => aviso.toLowerCase().includes(s))) {
      this.bloqueado = `La plataforma interpuso una verificación en ${url}: «${aviso}». Detención total.`;
      throw new PjudBloqueado(this.bloqueado);
    }
    if (res!.status >= 500) throw new PjudNoRespondio(`El Poder Judicial respondió ${res!.status} a ${url}: error suyo, reintentar más tarde.`);
    if (res!.status === 404) throw new EstructuraInesperada(`El Poder Judicial respondió 404 a ${url}: la ruta cambió o el host está caído.`);
    if (res!.status >= 400) throw new EstructuraInesperada(`El Poder Judicial respondió ${res!.status} a ${url}.`);
    return { status: res!.status, text, contentType: res!.headers.get("content-type") ?? "" };
  }

  /* ---------- sesión ---------- */

  async abrirSesion(): Promise<void> {
    await this.req("GET", ENTRADA, { headers: { Referer: PORTADA } });
    const pagina = (await this.req("GET", `${PJUD_BASE}/consultaUnificada.php`, { headers: { Referer: `${PJUD_BASE}/indexN.php` } })).text;
    const adir = pagina.match(/ADIR_\d+/);
    const token = pagina.match(/token\s*:\s*'([0-9a-f]{32})'/);
    if (!adir || !token) {
      const falta = !adir && !token ? "sin el prefijo de rutas ni el token" : !adir ? "sin el prefijo de rutas" : "sin el token";
      throw new PjudBloqueado(`consultaUnificada.php respondió, pero ${falta} que trae cuando la sesión está bien abierta. Puede ser un cambio del sitio o una caída transitoria.`);
    }
    this.adir = adir[0];
    this.token = token[1];
  }

  private async prefijo(): Promise<string> {
    if (!this.adir) await this.abrirSesion();
    return this.adir!;
  }

  private async ajax(ruta: string, form: Record<string, string>): Promise<string> {
    const adir = await this.prefijo();
    return (await this.req("POST", `${PJUD_BASE}/${adir}/${ruta}`, { form, headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${PJUD_BASE}/consultaUnificada.php` } })).text;
  }

  private async combos(ruta: string, form: Record<string, string>): Promise<Record<string, string>[]> {
    await this.prefijo();
    const r = await this.req("POST", `${PJUD_BASE}/${ruta}`, { form, headers: { "X-Requested-With": "XMLHttpRequest", Referer: `${PJUD_BASE}/consultaUnificada.php` } });
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(r.text);
    } catch {
      throw new EstructuraInesperada(`${ruta} tenía que contestar JSON y contestó ${r.contentType || "sin content-type"} con ${r.text.length} caracteres.`);
    }
    if (!Array.isArray(cuerpo)) throw new EstructuraInesperada(`${ruta} devolvió ${typeof cuerpo} en vez de una lista.`);
    return cuerpo as Record<string, string>[];
  }

  /* ---------- códigos de cortes y tribunales ---------- */

  async listarCortes(): Promise<Corte[]> {
    const filas = await this.combos("combosJSON/leeCorte.php", { tipoBusqueda: "1" });
    const cortes = filas.filter((f) => f.COD_CORTE).map((f) => ({ codigo: Number(f.COD_CORTE), nombre: texto(f.GLS_CORTE ?? "") }));
    if (!cortes.length) throw new EstructuraInesperada("El listado de cortes vino vacío.");
    return cortes;
  }

  async listarTribunalesCiviles(corte: number): Promise<Tribunal[]> {
    const filas = await this.combos("combosJSON/leeTrib.php", { codCompetencia: String(COMPETENCIA_CIVIL), codCorte: String(corte), tipoBusqueda: "1" });
    return filas.filter((f) => f.COD_TRIBUNAL).map((f) => ({ codigo: Number(f.COD_TRIBUNAL), nombre: texto(f.GLS_TRIBUNAL ?? ""), corte }));
  }

  /* ---------- búsqueda y detalle ---------- */

  /** Busca por rol en civil. `tribunal` 0 amplía a todos los tribunales (la fila trae el nombre del tribunal). */
  async buscarPorRol(tipo: string, numero: number, anio: number, tribunal = 0): Promise<CausaEncontrada[]> {
    const html = await this.ajax("civil/consultaRitCivil.php", {
      conTipoCausa: tipo.toUpperCase(),
      conRolCausa: String(numero),
      conEraCausa: String(anio),
      conCompetencia: String(COMPETENCIA_CIVIL),
      conCorte: "0",
      conTribunal: String(tribunal || 0),
      conCaratulado: "",
      "radio-group": "1",
    });
    const aviso = leerAviso(html);
    if (aviso) throw new EstructuraInesperada(`La plataforma rechazó la búsqueda: ${aviso}`);
    const $ = cheerio.load(`<table>${html}</table>`);
    const causas: CausaEncontrada[] = [];
    $("tr").each((_, tr) => {
      const onclick = $(tr).find('a[onclick*="detalleCausa"]').attr("onclick") ?? "";
      const ref = onclick.match(/detalleCausa\w*\('([^']+)'\)/);
      if (!ref) return;
      const celdas = $(tr)
        .find("td")
        .map((__, td) => texto($(td).text()))
        .get();
      if (celdas.length < 5) throw new EstructuraInesperada(`Una fila del listado trae ${celdas.length} celdas y se esperaban 5.`);
      causas.push({ referencia: ref[1], rol: celdas[1], fecha_ingreso: celdas[2], caratulado: celdas[3], tribunal: celdas[4] });
    });
    if (!causas.length && !html.includes(SIN_RESULTADOS)) throw new EstructuraInesperada("El listado no trae filas ni el mensaje de «sin resultados».");
    return causas;
  }

  async detalle(referencia: string): Promise<string> {
    await this.prefijo();
    return this.ajax("civil/modal/causaCivil.php", { dtaCausa: referencia, token: this.token ?? "" });
  }

  /** Los PDFs de la carpeta «Anexo» de un escrito (columna Anexo de la Historia), con `Actuacion.anexo_ref`. */
  async anexosSolicitud(referencia: string): Promise<AnexoDoc[]> {
    await this.prefijo();
    return parseAnexos(await this.ajax("civil/modal/anexoCausaSolicitudCivil.php", { dtaCausaAnex: referencia }));
  }

  /** Los PDFs de «Anexos de la causa» (carpeta de la cabecera), con `DetalleCausa.anexos_causa_ref`. */
  async anexosCausa(referencia: string): Promise<AnexoDoc[]> {
    await this.prefijo();
    return parseAnexos(await this.ajax("civil/modal/anexoCausaCivil.php", { dtaAnexCau: referencia }));
  }

  /**
   * Todo lo que publica el detalle de una causa civil: cabecera, litigantes y la Historia de TODOS sus cuadernos.
   * Con `tribunalCodigo` la búsqueda es exacta; sin él se busca en todos y se elige la fila cuyo tribunal calce con
   * `tribunalNombre` (normalizado). Ante ambigüedad se detiene en vez de elegir: la historia de otra causa se vería
   * perfectamente bien y llevaría a computar un plazo ajeno.
   */
  async detalleCausa(rol: string, tribunalNombre: string, tribunalCodigo = 0): Promise<DetalleCausa> {
    const m = rol.trim().toUpperCase().match(/^([A-Z])-(\d+)-(\d{4})$/);
    if (!m) throw new CausaNoEncontrada(`El rol «${rol}» no tiene la forma C-1234-2026.`);
    const [, tipo, numero, anio] = m;
    const peticionesAntes = this.bitacora.length;
    const causas = await this.buscarPorRol(tipo, Number(numero), Number(anio), tribunalCodigo);
    if (!causas.length) throw new CausaNoEncontrada(`No se encontró ${rol} en civil${tribunalCodigo ? ` (tribunal ${tribunalCodigo})` : ""}. Puede ser el rol, el año o el tribunal; las causas reservadas tampoco aparecen.`);
    const esperado = `${tipo}-${Number(numero)}-${anio}`.toLowerCase();
    let exactas = causas.filter((c) => c.rol.trim().toLowerCase() === esperado);
    if (exactas.length > 1) {
      const quiero = normalizarTribunal(tribunalNombre);
      const porTribunal = exactas.filter((c) => normalizarTribunal(c.tribunal) === quiero);
      if (porTribunal.length === 1) exactas = porTribunal;
    }
    if (exactas.length !== 1) throw new CausaNoEncontrada(`${rol}: la búsqueda devolvió ${exactas.length} causas con ese rol (${causas.map((c) => c.tribunal).join(" / ")}) y no se puede elegir sin ambigüedad.`);
    const fila = exactas[0];
    const primera = await this.detalle(fila.referencia);
    const cab = cabecera(primera);
    const cuadernos = parseCuadernos(primera);
    const paginas: { html: string; nombre: string }[] = [];
    if (cuadernos.length <= 1) paginas.push({ html: primera, nombre: cuadernos[0]?.nombre ?? "" });
    else {
      // El cuaderno que la respuesta ya trae desplegado no se vuelve a pedir
      for (const c of cuadernos) paginas.push({ html: c.mostrado ? primera : await this.detalle(c.referencia), nombre: c.nombre });
    }
    return {
      rol: cab.rol || fila.rol,
      tribunal: cab.tribunal || fila.tribunal,
      caratulado: fila.caratulado,
      fecha_ingreso: fechaIso(cab.fecha_ingreso || fila.fecha_ingreso),
      estado_adm: cab.estado_adm,
      estado_proc: cab.estado_proc,
      procedimiento: cab.procedimiento,
      etapa: cab.etapa,
      ubicacion: cab.ubicacion,
      partes: parseLitigantes(primera),
      cuadernos: paginas.map((p) => ({ nombre: p.nombre, actuaciones: parseHistoria(p.html, p.html !== primera) })),
      ...documentosCabecera(primera),
      peticiones: this.bitacora.length - peticionesAntes,
    };
  }
}

/* ---------- lectura del HTML ---------- */

/** El aviso de validación que la plataforma mete en un `swal(...)` dentro de una respuesta 200, si lo hay. */
export function leerAviso(html: string): string | null {
  const m = html.match(/swal\(\s*"[^"]*"\s*,\s*"([^"]+)"/);
  return m ? m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : null;
}

/** Los rótulos de la cabecera del detalle (`<td><strong>ROL:</strong> E-468-2026`). */
/** El formulario de descarga (el primero de `contenedor`, o él mismo si ya es un form), o nada: action, nombre del input y su JWT. */
function leerFormulario($: cheerio.CheerioAPI, contenedor: ReturnType<cheerio.CheerioAPI>): FormularioDoc | null {
  const form = contenedor.is("form") ? contenedor : contenedor.find("form").first();
  if (!form.length) return null;
  const action = texto(form.attr("action") ?? "");
  const input = form.find("input[name]").filter((_, i) => !!texto($(i).attr("value") ?? "")).first();
  if (!action || !input.length) return null;
  return { action, param: input.attr("name") ?? "", token: texto(input.attr("value") ?? "") };
}

/** La referencia opaca de un `onclick="algo('…')"`, o nulo. */
const referenciaDe = (onclick: string | undefined): string | null => onclick?.match(/\('([^']+)'\)/)?.[1] ?? null;

/** Las filas de «Anexo Solicitud» / «Anexo de la Causa»: Doc. (formulario anexoDocCivil.php) · Fecha · Referencia. */
export function parseAnexos(html: string): AnexoDoc[] {
  const $ = cheerio.load(html);
  const out: AnexoDoc[] = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;
    const f = leerFormulario($, $(tds[0]));
    if (!f) return;
    out.push({ ...f, fecha: fechaIso(texto($(tds[1]).text())), referencia: texto($(tds[2]).text()) });
  });
  return out;
}

/** Documentos de la cabecera del detalle (Texto demanda, Certificado de envío, Ebook, carpeta de anexos), reconocidos por el nombre del .php. */
export function documentosCabecera(html: string): Pick<DetalleCausa, "demanda_action" | "demanda_param" | "demanda_token" | "cert_demanda_action" | "cert_demanda_param" | "cert_demanda_token" | "ebook_action" | "ebook_param" | "ebook_token" | "tiene_anexos_causa" | "anexos_causa_ref"> {
  const $ = cheerio.load(html);
  const anexosRef = referenciaDe($("a[onclick*='anexoCausaCivil']").attr("onclick"));
  const porNombre = (php: string): FormularioDoc | null => {
    let out: FormularioDoc | null = null;
    $("form").each((_, f) => {
      if (out) return;
      const action = texto($(f).attr("action") ?? "");
      if (action.split("/").pop()?.toLowerCase() !== php) return;
      out = leerFormulario($, $(f));
    });
    return out;
  };
  const demanda = porNombre("docu.php");
  const cert = porNombre("doccertificadodemanda.php");
  const ebook = porNombre("newebookcivil.php");
  return {
    demanda_action: demanda?.action ?? null,
    demanda_param: demanda?.param ?? null,
    demanda_token: demanda?.token ?? null,
    cert_demanda_action: cert?.action ?? null,
    cert_demanda_param: cert?.param ?? null,
    cert_demanda_token: cert?.token ?? null,
    ebook_action: ebook?.action ?? null,
    ebook_param: ebook?.param ?? null,
    ebook_token: ebook?.token ?? null,
    tiene_anexos_causa: !!anexosRef,
    anexos_causa_ref: anexosRef,
  };
}

export function cabecera(html: string) {
  const $ = cheerio.load(html);
  $("*")
    .contents()
    .filter((_, n) => n.type === "comment")
    .remove();
  const valor = (rotulo: string) => {
    let out = "";
    $("table.table-titulos td strong").each((_, el) => {
      if (texto($(el).text()).replace(/:$/, "").toLowerCase() === rotulo.toLowerCase()) {
        const td = $(el).parent();
        const clon = td.clone();
        clon.find("strong").remove();
        clon.find("form, input, script").remove();
        out = texto(clon.text());
      }
    });
    return out;
  };
  return {
    rol: valor("ROL").replace(/\s.*$/, ""),
    fecha_ingreso: valor("F. Ing."),
    estado_adm: valor("Est. Adm."),
    procedimiento: valor("Proc."),
    ubicacion: valor("Ubicación"),
    estado_proc: valor("Estado Proc."),
    etapa: valor("Etapa"),
    tribunal: valor("Tribunal"),
  };
}

export function parseCuadernos(html: string): { nombre: string; referencia: string; mostrado: boolean }[] {
  const $ = cheerio.load(html);
  return $('select[id^="selCuaderno"] option')
    .map((_, op) => ({ nombre: texto($(op).text()), referencia: $(op).attr("value") ?? "", mostrado: $(op).attr("selected") != null }))
    .get()
    .filter((c) => c.referencia);
}

const ENCABEZADOS_HISTORIA = ["folio", "doc.", "anexo", "etapa", "trámite", "desc. trámite", "fec. trámite", "foja", "georref."];

/** `permitirVacia`: un cuaderno secundario (p. ej. apremio recién abierto) puede no tener folios todavía; el principal nunca. */
export function parseHistoria(html: string, permitirVacia = false): Actuacion[] {
  const $ = cheerio.load(html);
  $("*")
    .contents()
    .filter((_, n) => n.type === "comment")
    .remove();
  const panel = $("#historiaCiv");
  if (!panel.length) throw new EstructuraInesperada("No existe el panel historiaCiv en el detalle: la estructura de la OJV cambió.");
  const tabla = panel.find("table").first();
  if (!tabla.length) throw new EstructuraInesperada("El panel historiaCiv no contiene ninguna tabla.");
  const encabezados = tabla
    .find("th")
    .map((_, th) => texto($(th).text()).toLowerCase())
    .get();
  validarEncabezados(encabezados, ENCABEZADOS_HISTORIA, "historiaCiv");
  const out: Actuacion[] = [];
  tabla.find("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < ENCABEZADOS_HISTORIA.length) return; // encabezado o paginación
    const t = (i: number) => texto($(tds[i]).text());
    const fec = t(6).match(/(\d{2}\/\d{2}\/\d{4})(?:\s*\(\s*(\d{2}\/\d{2}\/\d{4})\s*\))?/);
    const registro = fec ? fechaIso(fec[1]) : null;
    let diligencia = fec?.[2] ? fechaIso(fec[2]) : null;
    const desc = t(5);
    const dil = desc.match(/Diligencia:\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!diligencia && dil) diligencia = fechaIso(dil[1]);
    const folio = /^\d+$/.test(t(0)) ? Number(t(0)) : null;
    // Columna Doc.: el documento y, en los escritos, el certificado de envío (se reconoce por el .php)
    const formas = $(tds[1])
      .find("form")
      .map((__, f) => leerFormulario($, $(f)))
      .get()
      .filter((f): f is FormularioDoc => !!f);
    const esCert = (f: FormularioDoc) => f.action.split("/").pop()?.toLowerCase() === "doccertificadoescrito.php";
    const doc = formas.find((f) => !esCert(f)) ?? null;
    const cert = formas.find(esCert) ?? null;
    const anexoRef = referenciaDe($(tds[2]).find("a[onclick*='anexoSolicitudCivil']").attr("onclick"));
    const fila: Actuacion = {
      folio,
      etapa: t(3),
      tramite: t(4),
      descripcion: desc,
      fecha_diligencia: diligencia,
      fecha_registro: registro,
      foja: t(7) || null,
      tiene_documento: $(tds[1]).find("form, a").length > 0,
      doc_action: doc?.action ?? null,
      doc_param: doc?.param ?? null,
      doc_token: doc?.token ?? null,
      cert_action: cert?.action ?? null,
      cert_param: cert?.param ?? null,
      cert_token: cert?.token ?? null,
      tiene_anexo: !!anexoRef,
      anexo_ref: anexoRef,
    };
    // El sitio a veces repite una fila empobrecida (mismo folio y descripción, lo demás vacío o igual): no es otra actuación
    const anterior = out[out.length - 1];
    if (anterior && anterior.folio === fila.folio && anterior.descripcion === fila.descripcion && (Object.keys(fila) as (keyof Actuacion)[]).every((k) => !fila[k] || fila[k] === anterior[k])) return;
    out.push(fila);
  });
  if (!out.length && !permitirVacia) throw new EstructuraInesperada("La tabla de Historia tiene encabezados pero ninguna fila: respuesta truncada o estructura cambiada.");
  return out;
}

const ENCABEZADOS_LITIGANTES = ["participante", "rut", "persona", "nombre o razón social"];

export function parseLitigantes(html: string): Parte[] {
  const $ = cheerio.load(html);
  $("*")
    .contents()
    .filter((_, n) => n.type === "comment")
    .remove();
  const panel = $("#litigantesCiv");
  if (!panel.length) throw new EstructuraInesperada("No existe el panel litigantesCiv en el detalle.");
  const tabla = panel.find("table").first();
  const encabezados = tabla
    .find("th")
    .map((_, th) => texto($(th).text()).toLowerCase())
    .get();
  validarEncabezados(encabezados, ENCABEZADOS_LITIGANTES, "litigantesCiv");
  const out: Parte[] = [];
  tabla.find("tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 4) return;
    const t = (i: number) => texto($(tds[i]).text());
    out.push({ tipo: SUJETO_A_TIPO(t(0)), sujeto: t(0), rut: t(1), persona: t(2), nombre: t(3) });
  });
  if (!out.length) throw new EstructuraInesperada("El panel de litigantes tiene encabezados y ninguna fila: toda causa tiene partes.");
  return out;
}

function validarEncabezados(reales: string[], esperados: string[], panel: string) {
  if (reales.length !== esperados.length) throw new EstructuraInesperada(`El panel ${panel} trae ${reales.length} columnas y se esperaban ${esperados.length}: ${reales.join(" | ")}`);
  esperados.forEach((e, i) => {
    if (!reales[i].includes(e)) throw new EstructuraInesperada(`En el panel ${panel} la columna ${i} dice «${reales[i]}» y se esperaba «${e}».`);
  });
}

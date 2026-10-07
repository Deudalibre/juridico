"use client";

import Link from "next/link";
import { useState } from "react";
import { DocxRender } from "@/components/DocxRender";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import type { DriveFile, DriveFolder } from "@/lib/google";

export type ClienteCarpeta = { id: string; full_name: string; rut: string | null; internal_number: string | null; cerrada: boolean };

type Props = { raiz: DriveFile[]; items: DriveFile[]; carpeta: DriveFolder | null; root: DriveFolder; clientes: Record<string, ClienteCarpeta>; archivoId: string | null; q: string };
type SortKey = "nombre" | "tipo" | "tamano" | "fecha" | "rut" | "numero";

/** Contenido servido por la app con su propia conexión al Drive (no hace falta iniciar sesión en Google) */
const fileUrl = (id: string) => `/api/drive/file/${encodeURIComponent(id)}`;
/** Para lo que la app no sabe dibujar (vídeos, archivos raros): la vista previa del propio Drive */
const drivePreviewUrl = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;

const fmtSize = (n: number | null) => (n == null ? "—" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const TZ = "America/Santiago";
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const dia = (x: Date) => x.toLocaleDateString("es-CL", { timeZone: TZ });
  const hora = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  if (dia(d) === dia(hoy)) return `Hoy, ${hora}`;
  if (dia(d) === dia(new Date(hoy.getTime() - 86400000))) return `Ayer, ${hora}`;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: d.getFullYear() === hoy.getFullYear() ? undefined : "numeric", timeZone: TZ });
};

/** Tipo de archivo: etiqueta corta, nombre y colores de la ficha (una familia por tipo, sin inventar paleta nueva). */
type Tipo = { tag: string; nombre: string; bg: string; fg: string; render: "word" | "pdf" | "imagen" | "drive" | "carpeta" };
const CARPETA: Tipo = { tag: "", nombre: "Carpeta", bg: "var(--band)", fg: "var(--text-faint)", render: "carpeta" };
const tipoDe = (f: Pick<DriveFile, "mimeType" | "isFolder">): Tipo => {
  const m = f.mimeType;
  if (f.isFolder) return CARPETA;
  if (/wordprocessingml\.document$|msword$/.test(m)) return { tag: "DOC", nombre: "Word", bg: "var(--surface-active)", fg: "var(--brand-dark)", render: "word" };
  if (m === "application/pdf") return { tag: "PDF", nombre: "PDF", bg: "var(--danger-bg)", fg: "var(--danger)", render: "pdf" };
  if (m.startsWith("image/")) return { tag: "IMG", nombre: "Imagen", bg: "var(--success-bg)", fg: "var(--success)", render: "imagen" };
  if (m === "application/vnd.google-apps.document") return { tag: "GDOC", nombre: "Documento de Google", bg: "var(--surface-active)", fg: "var(--brand-dark)", render: "pdf" };
  if (m === "application/vnd.google-apps.spreadsheet") return { tag: "GSHT", nombre: "Planilla de Google", bg: "var(--success-bg)", fg: "var(--success)", render: "pdf" };
  if (/spreadsheetml|ms-excel/.test(m)) return { tag: "XLS", nombre: "Planilla", bg: "var(--success-bg)", fg: "var(--success)", render: "drive" };
  if (m.startsWith("video/")) return { tag: "VID", nombre: "Vídeo", bg: "var(--warning-bg)", fg: "var(--warning)", render: "drive" };
  return { tag: "ARCH", nombre: "Archivo", bg: "var(--band)", fg: "var(--text-faint)", render: "drive" };
};

function TipoTile({ tipo }: { tipo: Tipo }) {
  if (tipo.render === "carpeta")
    return (
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: tipo.bg, color: "var(--brand-dark)" }} aria-hidden>
        <Icon name="folder" size={15} />
      </span>
    );
  return (
    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[9.5px] font-bold tracking-wider" style={{ background: tipo.bg, color: tipo.fg }} aria-hidden>
      {tipo.tag}
    </span>
  );
}

const porNombre = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/**
 * Cuerpo de la carpeta universal con la estructura de «Todos los leads»: lateral con los clientes como si fueran filtros,
 * fila «Mostrando N» con el buscador, tabla densa de 54 px y, al elegir un archivo, la vista previa a la derecha de la
 * tabla. Elegir un archivo no recarga la página; cambiar de carpeta sí (la lista viene del Drive).
 */
export function CarpetaUniversal({ raiz, items, carpeta, root, clientes, archivoId, q }: Props) {
  const archivosDeCarpeta = items.filter((f) => !f.isFolder);
  // La página monta este componente con key = carpeta: al entrar en una carpeta se abre el archivo pedido o el más reciente
  const [sel, setSel] = useState<DriveFile | null>(() => archivosDeCarpeta.find((f) => f.id === archivoId) ?? (carpeta ? [...archivosDeCarpeta].sort((a, b) => Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime))[0] ?? null : null));
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(carpeta ? { key: "fecha", dir: -1 } : { key: "nombre", dir: 1 });
  const [filtro, setFiltro] = useState("");

  const cliente = carpeta ? clientes[carpeta.id] : undefined;
  const nombreDe = (f: DriveFile) => clientes[f.id]?.full_name ?? f.name;

  // Tabla: filtra por el buscador y ordena por la columna elegida (carpetas siempre antes que archivos)
  const n = q.trim().toLowerCase();
  const visibles = items.filter((f) => !n || f.name.toLowerCase().includes(n) || nombreDe(f).toLowerCase().includes(n) || (clientes[f.id]?.rut ?? "").includes(n.replace(/[^0-9k]/gi, "")));
  const cmp = (a: DriveFile, b: DriveFile): number => {
    const ca = clientes[a.id];
    const cb = clientes[b.id];
    switch (sort.key) {
      case "tipo":
        return porNombre(tipoDe(a).nombre, tipoDe(b).nombre);
      case "tamano":
        return (a.size ?? -1) - (b.size ?? -1);
      case "fecha":
        return Date.parse(a.modifiedTime) - Date.parse(b.modifiedTime);
      case "rut":
        return porNombre(ca?.rut ?? "", cb?.rut ?? "");
      case "numero":
        return porNombre(ca?.internal_number ?? "", cb?.internal_number ?? "");
      default:
        return porNombre(nombreDe(a), nombreDe(b));
    }
  };
  const filas = [...visibles].sort((a, b) => (a.isFolder === b.isFolder ? cmp(a, b) * sort.dir : a.isFolder ? -1 : 1));
  const archivos = filas.filter((f) => !f.isFolder);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "fecha" ? -1 : 1 }));

  // Lateral: carpetas de clientes de la raíz, filtradas al vuelo
  const fl = filtro.trim().toLowerCase();
  const lateral = raiz
    .filter((f) => f.isFolder)
    .filter((f) => !fl || f.name.toLowerCase().includes(fl) || nombreDe(f).toLowerCase().includes(fl) || (clientes[f.id]?.rut ?? "").includes(fl.replace(/[^0-9k]/gi, "")))
    .sort((a, b) => porNombre(nombreDe(a), nombreDe(b)));

  // Flechas arriba/abajo recorren los archivos de la tabla; Escape cierra la vista previa
  const onKey = (e: React.KeyboardEvent) => {
    if (!archivos.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = sel ? archivos.findIndex((f) => f.id === sel.id) : -1;
      setSel(archivos[e.key === "ArrowDown" ? Math.min(archivos.length - 1, i + 1) : Math.max(0, i - 1)]);
    } else if (e.key === "Escape") setSel(null);
  };

  // Columnas: en la raíz, datos del cliente; dentro de una carpeta, datos del archivo. Con la vista previa abierta la
  // tabla se estrecha y se quedan las dos columnas que importan.
  const columnas: { key: SortKey; label: string; w: string; align?: "right"; ocultable?: boolean }[] = carpeta
    ? [
        { key: "nombre", label: "Nombre", w: "minmax(0,1fr)" },
        { key: "tipo", label: "Tipo", w: "92px", ocultable: true },
        { key: "tamano", label: "Tamaño", w: "80px", align: "right", ocultable: true },
        { key: "fecha", label: "Modificado", w: "118px", align: "right" },
      ]
    : [
        { key: "nombre", label: "Cliente", w: "minmax(0,1fr)" },
        { key: "rut", label: "RUT", w: "118px" },
        { key: "numero", label: "N°", w: "64px" },
        { key: "fecha", label: "Modificado", w: "118px", align: "right" },
      ];
  const cols = sel ? columnas.filter((c) => !c.ocultable) : columnas;
  const grid = { gridTemplateColumns: cols.map((c) => c.w).join(" ") + " 24px" };
  const celda = (c: { key: SortKey }) => cols.some((x) => x.key === c.key);

  return (
    <div className="frame-split">
      {/* ------------------------------------------ Lateral: clientes (como los filtros) ------------------------------------------ */}
      <aside aria-label="Clientes" className="flex min-h-0 flex-col">
        <div className="filter-panel-head">
          <span className="text-[14px] font-semibold text-fg">Clientes</span>
          <span className="tabnum text-[12px] text-faint">{raiz.filter((f) => f.isFolder).length}</span>
        </div>
        <div className="px-3 pt-3">
          <label className="board-search !w-full !h-[30px]">
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar cliente o RUT…" aria-label="Filtrar clientes" autoComplete="off" className="!text-[12.5px]" />
            <Icon name="search" size={14} />
          </label>
        </div>
        <nav className="filter-group-body min-h-0 flex-1 overflow-y-auto !pt-3" aria-label="Carpetas">
          <Link href="/documentos" className="filter-opt" aria-current={!carpeta ? "true" : undefined} title={root.name}>
            <span className="dot" aria-hidden>
              {!carpeta && <Icon name="check" size={10} />}
            </span>
            <span className="min-w-0 flex-1 truncate">Todas las carpetas</span>
          </Link>
          {lateral.map((f) => {
            const activo = carpeta?.id === f.id;
            const c = clientes[f.id];
            return (
              <Link key={f.id} href={`/documentos?carpeta=${encodeURIComponent(f.id)}`} className="filter-opt" aria-current={activo ? "true" : undefined} title={c?.rut ? `${nombreDe(f)} · ${formatRut(c.rut)}` : f.name}>
                <span className="dot" aria-hidden>
                  {activo && <Icon name="check" size={10} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{nombreDe(f)}</span>
                {c?.cerrada && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--danger)" }} title="Causa cerrada" />}
              </Link>
            );
          })}
          {lateral.length === 0 && <span className="px-2 py-3 text-center text-[12px] text-faint">{fl ? "Ningún cliente coincide." : "Todavía no hay carpetas."}</span>}
        </nav>
      </aside>

      {/* ------------------------------------------------ Resultados ------------------------------------------------ */}
      <section className="flex min-h-0 min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap text-[14px] text-fg">
            {carpeta ? (
              <>
                <Link href="/documentos" className="icon-btn plain -ml-1.5 shrink-0" aria-label="Volver a todas las carpetas" title="Todas las carpetas">
                  <span className="inline-flex rotate-180">
                    <Icon name="chevron" size={15} />
                  </span>
                </Link>
                <span className="avatar h-7 w-7 shrink-0 text-[10px]">{initials(cliente?.full_name ?? carpeta.name) || "?"}</span>
                <strong className="truncate font-semibold">{cliente?.full_name ?? carpeta.name}</strong>
                {cliente?.rut && <span className="tabnum hidden text-[12.5px] text-muted lg:inline">· {formatRut(cliente.rut)}</span>}
                {cliente?.cerrada && <span className="tag danger">Cerrada</span>}
                <span className="text-muted">
                  · <strong className="tabnum text-fg">{archivos.length}</strong> {archivos.length === 1 ? "archivo" : "archivos"}
                </span>
              </>
            ) : (
              <>
                Mostrando <strong className="tabnum text-fg">{filas.filter((f) => f.isFolder).length}</strong> {filas.filter((f) => f.isFolder).length === 1 ? "cliente" : "clientes"}
                <span className="text-faint" title="Cada cliente tiene su carpeta en el Drive del estudio; se crea sola al generar su primer documento. Haz clic en una cabecera para ordenar.">
                  <Icon name="info" size={14} />
                </span>
              </>
            )}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {cliente && (
              <Link href={`/documentos/lvs/${cliente.id}`} className="btn-outline btn-sm whitespace-nowrap" title="Abrir el expediente LVS de este cliente">
                <Icon name="report" size={13} /> Expediente LVS
              </Link>
            )}
            <form action="/documentos" role="search" className="board-search !w-[220px]">
              {carpeta && <input type="hidden" name="carpeta" value={carpeta.id} />}
              <input name="q" defaultValue={q} placeholder={carpeta ? "Buscar archivo…" : "Buscar cliente o RUT…"} aria-label="Buscar" autoComplete="off" />
              <Icon name="search" size={15} />
            </form>
          </div>
        </div>

        <div className={`grid min-h-0 flex-1 ${sel ? "grid-cols-[minmax(0,1fr)_minmax(0,52%)]" : "grid-cols-1"}`}>
          {/* Tabla */}
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="th-band grid items-center gap-3 border-y border-line px-4 py-2.5" style={grid} role="row">
              {cols.map((c) => {
                const activa = sort.key === c.key;
                return (
                  <button key={c.key} type="button" onClick={() => toggleSort(c.key)} className={`th flex items-center gap-1 ${c.align === "right" ? "justify-end" : ""} ${activa ? "!text-fg" : ""}`} role="columnheader" aria-sort={activa ? (sort.dir === 1 ? "ascending" : "descending") : "none"} title={`Ordenar por ${c.label.toLowerCase()}`}>
                    {c.label}
                    <span className={`inline-flex transition-transform ${activa ? "opacity-100" : "opacity-0"} ${activa && sort.dir === -1 ? "-rotate-90" : "rotate-90"}`} aria-hidden>
                      <Icon name="chevron" size={11} />
                    </span>
                  </button>
                );
              })}
              <span />
            </div>
            {filas.length === 0 ? (
              <div className="empty flex-1">
                <span className="icon-tile">
                  <Icon name={q ? "search" : "folder"} />
                </span>
                <span className="empty-title">{q ? "Sin resultados" : carpeta ? "Carpeta vacía" : "Todavía no hay carpetas de clientes"}</span>
                <span className="empty-text">{q ? "Prueba con otro nombre o RUT." : carpeta ? "Los documentos que generes para este cliente aparecerán aquí." : "Se crean solas al generar el primer documento de cada solicitud LVS."}</span>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto outline-none" tabIndex={0} onKeyDown={onKey} role="grid" aria-label={carpeta ? "Archivos de la carpeta" : "Carpetas de clientes"}>
                {filas.map((f) => {
                  const t = tipoDe(f);
                  const c = clientes[f.id];
                  if (f.isFolder)
                    return (
                      <Link key={f.id} href={`/documentos?carpeta=${encodeURIComponent(f.id)}`} className="row grid min-h-[54px] items-center gap-3 px-4 py-1.5 text-fg" style={grid} role="row" title={`Abrir ${f.name}`}>
                        <span className="flex min-w-0 items-center gap-2" role="gridcell">
                          {carpeta ? <TipoTile tipo={CARPETA} /> : <span className="avatar h-8 w-8 text-[11px]">{initials(nombreDe(f)) || "?"}</span>}
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[13px] font-medium leading-4">{nombreDe(f)}</span>
                            <span className="truncate text-[11px] leading-[14px] text-muted">{carpeta ? "Carpeta" : c ? (f.name !== c.full_name.toUpperCase() ? f.name : "Carpeta del cliente") : "Sin causa enlazada en Jurídico"}</span>
                          </span>
                        </span>
                        {carpeta ? (
                          <>
                            {celda({ key: "tipo" }) && <span className="text-[12.5px] text-soft" role="gridcell">Carpeta</span>}
                            {celda({ key: "tamano" }) && <span className="tabnum text-right text-[12.5px] text-faint" role="gridcell">—</span>}
                          </>
                        ) : (
                          <>
                            <span className="tabnum text-[13px] text-soft" role="gridcell">{c?.rut ? formatRut(c.rut) : <span className="text-faint">—</span>}</span>
                            <span className="tabnum text-[13px] text-soft" role="gridcell">{c?.internal_number ?? <span className="text-faint">—</span>}</span>
                          </>
                        )}
                        <span className="tabnum text-right text-[12.5px] text-soft" role="gridcell">{fmtDate(f.modifiedTime)}</span>
                        <span className="flex justify-end text-faint" role="gridcell">
                          <Icon name="chevron" size={14} />
                        </span>
                      </Link>
                    );
                  const active = sel?.id === f.id;
                  return (
                    <button key={f.id} type="button" onClick={() => setSel(active ? null : f)} className={`row relative grid min-h-[54px] w-full items-center gap-3 px-4 py-1.5 text-left text-fg ${active ? "bg-[color:var(--surface-active)]" : ""}`} style={grid} role="row" aria-selected={active} title={f.name}>
                      {active && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--brand-dark)" }} aria-hidden />}
                      <span className="flex min-w-0 items-center gap-2" role="gridcell">
                        <TipoTile tipo={t} />
                        <span className="flex min-w-0 flex-col">
                          <span className={`truncate text-[13px] leading-4 ${active ? "font-semibold" : "font-medium"}`}>{f.name}</span>
                          {sel && <span className="truncate text-[11px] leading-[14px] text-muted">{t.nombre} · {fmtSize(f.size)}</span>}
                        </span>
                      </span>
                      {celda({ key: "tipo" }) && <span className="truncate text-[12.5px] text-soft" role="gridcell">{t.nombre}</span>}
                      {celda({ key: "tamano" }) && <span className="tabnum text-right text-[12.5px] text-soft" role="gridcell">{fmtSize(f.size)}</span>}
                      <span className="tabnum text-right text-[12.5px] text-soft" role="gridcell">{fmtDate(f.modifiedTime)}</span>
                      <span className={`flex justify-end ${active ? "text-accent" : "text-faint"}`} role="gridcell">
                        <Icon name="eye" size={14} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vista previa, a la derecha de la tabla */}
          {sel && (
            <div className="flex min-h-0 min-w-0 flex-col border-l border-line">
              <VistaPrevia key={sel.id} file={sel} onClose={() => setSel(null)} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3];

/** Vista previa: barra con el archivo, zoom y acciones, y el contenido dibujado por la app (Word, PDF, imagen) o por el Drive. */
function VistaPrevia({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const t = tipoDe(file);
  // Empieza ajustado al ancho del panel; +/− recorren los pasos fijos desde el valor efectivo
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [fit, setFit] = useState(1);
  const [pages, setPages] = useState<number | null>(null);
  const efectivo = zoom === "fit" ? fit : zoom;
  const mas = () => setZoom(ZOOMS.find((z) => z > efectivo + 0.01) ?? ZOOMS[ZOOMS.length - 1]);
  const menos = () => setZoom([...ZOOMS].reverse().find((z) => z < efectivo - 0.01) ?? ZOOMS[0]);
  return (
    <>
      <div className="th-band flex items-center gap-2.5 border-y border-line px-3 py-1.5">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[12.5px] font-semibold text-fg" title={file.name}>
            {file.name}
          </span>
          <span className="truncate text-[11px] text-muted">
            {t.nombre}
            {pages ? ` · ${pages} ${pages === 1 ? "página" : "páginas"}` : ""}
            {file.size != null ? ` · ${fmtSize(file.size)}` : ""} · {fmtDate(file.modifiedTime).toLowerCase()}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {t.render === "word" && (
            <span className="mr-1 inline-flex items-center rounded-md border border-line bg-surface" role="group" aria-label="Zoom">
              <button type="button" className="icon-btn plain !h-6 !w-6 text-[13px]" onClick={menos} disabled={efectivo <= ZOOMS[0] + 0.01} aria-label="Alejar" title="Alejar">
                −
              </button>
              <button type="button" className={`tabnum min-w-[42px] px-1 text-[11px] ${zoom === "fit" ? "text-accent" : "text-soft"}`} onClick={() => setZoom(zoom === "fit" ? 1 : "fit")} title={zoom === "fit" ? "Ajustado al ancho · clic para tamaño real" : "Clic para ajustar al ancho"}>
                {Math.round(efectivo * 100)}%
              </button>
              <button type="button" className="icon-btn plain !h-6 !w-6 text-[13px]" onClick={mas} disabled={efectivo >= ZOOMS[ZOOMS.length - 1] - 0.01} aria-label="Acercar" title="Acercar">
                +
              </button>
            </span>
          )}
          <a href={`${fileUrl(file.id)}?descargar=1`} className="icon-btn" title="Descargar" aria-label="Descargar">
            <Icon name="download" size={14} />
          </a>
          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="icon-btn" title="Abrir en Google Drive" aria-label="Abrir en Google Drive">
            <Icon name="external" size={14} />
          </a>
          <button type="button" className="icon-btn plain" onClick={onClose} aria-label="Cerrar vista previa" title="Cerrar (Esc)">
            <Icon name="close" size={15} />
          </button>
        </span>
      </div>
      <Contenido file={file} tipo={t} zoom={zoom} onReady={(n, f) => (setPages(n), setFit(f))} />
    </>
  );
}

function Contenido({ file, tipo, zoom, onReady }: { file: DriveFile; tipo: Tipo; zoom: number | "fit"; onReady: (pages: number, fit: number) => void }) {
  if (tipo.render === "word") return <DocxRender url={fileUrl(file.id)} zoom={zoom} onReady={(ok, n, f) => ok && onReady(n, f)} className="min-h-0 flex-1" />;
  if (tipo.render === "pdf") return <iframe src={fileUrl(file.id)} title={`Vista previa de ${file.name}`} className="min-h-0 w-full flex-1 border-0" />;
  if (tipo.render === "imagen")
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-4" style={{ background: "var(--band)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por la app, tamaño desconocido */}
        <img src={fileUrl(file.id)} alt={file.name} className="max-w-full rounded-md border border-line bg-surface shadow-sm" />
      </div>
    );
  return <iframe src={drivePreviewUrl(file.id)} title={`Vista previa de ${file.name}`} className="min-h-0 w-full flex-1 border-0" allow="autoplay" />;
}

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

function TipoTile({ tipo, size = "md" }: { tipo: Tipo; size?: "md" | "sm" }) {
  const dims = size === "md" ? "h-8 w-8 text-[9.5px]" : "h-6 w-6 text-[8.5px]";
  if (tipo.render === "carpeta")
    return (
      <span className={`inline-flex shrink-0 items-center justify-center rounded-md ${dims}`} style={{ background: tipo.bg, color: "var(--brand-dark)" }} aria-hidden>
        <Icon name="folder" size={size === "md" ? 15 : 12} />
      </span>
    );
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-md font-bold tracking-wider ${dims}`} style={{ background: tipo.bg, color: tipo.fg }} aria-hidden>
      {tipo.tag}
    </span>
  );
}

const porNombre = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/**
 * Gestor de archivos en tres zonas: barra lateral con los clientes (siempre a mano), tabla central con columnas
 * ordenables y panel de vista previa con zoom. Elegir un archivo no recarga la página; cambiar de carpeta sí (la lista
 * viene del Drive).
 */
export function CarpetaUniversal({ raiz, items, carpeta, root, clientes, archivoId, q }: Props) {
  // La página monta este componente con key = carpeta, así que al cambiar de carpeta la selección empieza de cero
  const [sel, setSel] = useState<DriveFile | null>(() => items.find((f) => f.id === archivoId && !f.isFolder) ?? null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>(carpeta ? { key: "fecha", dir: -1 } : { key: "nombre", dir: 1 });
  const [filtro, setFiltro] = useState("");

  const cliente = carpeta ? clientes[carpeta.id] : undefined;
  const nombreDe = (f: DriveFile) => clientes[f.id]?.full_name ?? f.name;

  // Tabla central: filtra por el buscador y ordena por la columna elegida (carpetas siempre antes que archivos)
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

  // Barra lateral: carpetas de clientes de la raíz, filtradas al vuelo
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

  // Columnas: en la raíz, datos del cliente; dentro de una carpeta, datos del archivo
  const columnas: { key: SortKey; label: string; w: string; align?: "right" }[] = carpeta
    ? [
        { key: "nombre", label: "Nombre", w: "minmax(0,1fr)" },
        { key: "tipo", label: "Tipo", w: "96px" },
        { key: "tamano", label: "Tamaño", w: "84px", align: "right" },
        { key: "fecha", label: "Modificado", w: "118px", align: "right" },
      ]
    : [
        { key: "nombre", label: "Cliente", w: "minmax(0,1fr)" },
        { key: "rut", label: "RUT", w: "118px" },
        { key: "numero", label: "N°", w: "64px" },
        { key: "fecha", label: "Modificado", w: "118px", align: "right" },
      ];
  const grid = { gridTemplateColumns: columnas.map((c) => c.w).join(" ") + " 28px" };

  return (
    <div className="grid min-h-0 gap-3 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:grid-cols-[248px_minmax(380px,1fr)_minmax(0,1.15fr)]" style={{ height: "calc(100vh - 150px)" }}>
      {/* ------------------------------------------ Barra lateral: clientes ------------------------------------------ */}
      <aside className="panel hidden min-h-0 min-w-0 flex-col overflow-hidden xl:flex" aria-label="Clientes en el Drive">
        <div className="flex flex-col gap-2 border-b border-line px-3 pb-2.5 pt-3">
          <span className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Clientes</span>
            <span className="tabnum text-[11px] text-faint">{raiz.filter((f) => f.isFolder).length}</span>
          </span>
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} className="search !min-h-[30px] !w-full !text-[12.5px]" placeholder="Filtrar por nombre o RUT…" aria-label="Filtrar clientes" autoComplete="off" />
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-1">
          <Link href="/documentos" className={`relative flex items-center gap-2.5 px-3 py-2 text-[12.5px] ${!carpeta ? "font-semibold text-fg" : "text-soft hover:bg-[color:var(--band)]"}`} aria-current={!carpeta ? "page" : undefined} style={!carpeta ? { background: "var(--surface-active)" } : undefined}>
            {!carpeta && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r" style={{ background: "var(--brand-dark)" }} aria-hidden />}
            <TipoTile tipo={CARPETA} size="sm" />
            <span className="truncate">{root.name}</span>
          </Link>
          {lateral.map((f) => {
            const c = clientes[f.id];
            const activo = carpeta?.id === f.id;
            return (
              <Link key={f.id} href={`/documentos?carpeta=${encodeURIComponent(f.id)}`} className={`relative flex items-center gap-2.5 px-3 py-1.5 ${activo ? "" : "hover:bg-[color:var(--band)]"}`} aria-current={activo ? "page" : undefined} style={activo ? { background: "var(--surface-active)" } : undefined} title={f.name}>
                {activo && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r" style={{ background: "var(--brand-dark)" }} aria-hidden />}
                <span className="avatar h-7 w-7 text-[10px]">{initials(nombreDe(f)) || "?"}</span>
                <span className="flex min-w-0 flex-col">
                  <span className={`truncate text-[12.5px] ${activo ? "font-semibold text-fg" : "font-medium text-fg"}`}>{nombreDe(f)}</span>
                  <span className="tabnum truncate text-[11px] text-muted">{c?.rut ? formatRut(c.rut) : c ? "RUT pendiente" : "Sin causa enlazada"}</span>
                </span>
              </Link>
            );
          })}
          {lateral.length === 0 && <span className="block px-3 py-4 text-center text-[12px] text-faint">{fl ? "Ningún cliente coincide." : "Todavía no hay carpetas de clientes."}</span>}
        </nav>
      </aside>

      {/* ------------------------------------------------ Tabla central ------------------------------------------------ */}
      <section className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Archivos">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <nav className="flex min-w-0 flex-1 items-center gap-2.5" aria-label="Ruta">
            {carpeta ? (
              <>
                <Link href="/documentos" className="icon-btn plain shrink-0" aria-label="Volver a todas las carpetas" title="Todas las carpetas">
                  <span className="inline-flex rotate-180">
                    <Icon name="chevron" size={14} />
                  </span>
                </Link>
                <span className="avatar h-8 w-8 shrink-0 text-[11px]">{initials(cliente?.full_name ?? carpeta.name) || "?"}</span>
                <span className="flex min-w-0 flex-col">
                  <Link href="/documentos" className="truncate text-[11px] uppercase tracking-wider text-faint hover:text-fg hover:underline" title={root.name}>
                    {root.name}
                  </Link>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-fg" title={carpeta.name}>
                      {cliente?.full_name ?? carpeta.name}
                    </span>
                    {cliente?.cerrada && <span className="tag danger shrink-0">Cerrada</span>}
                  </span>
                </span>
              </>
            ) : (
              <>
                <TipoTile tipo={CARPETA} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-faint">Carpeta universal</span>
                  <span className="truncate text-[13.5px] font-semibold text-fg">{root.name}</span>
                </span>
              </>
            )}
          </nav>
          <form className="relative" role="search">
            {carpeta && <input type="hidden" name="carpeta" value={carpeta.id} />}
            <input name="q" defaultValue={q} className="search !min-h-[30px] !w-[150px] !text-[12.5px] focus:!w-[200px]" placeholder={carpeta ? "Buscar archivo…" : "Buscar cliente…"} aria-label="Buscar" autoComplete="off" />
          </form>
          {cliente && (
            <Link href={`/documentos/lvs/${cliente.id}`} className="btn-outline btn-sm shrink-0" title="Abrir el expediente LVS de este cliente">
              <Icon name="report" size={13} /> Expediente
            </Link>
          )}
        </div>

        <div className="th-band grid items-center gap-x-3 border-b border-line px-3 py-1.5" style={grid} role="row">
          {columnas.map((c) => {
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
                  <Link key={f.id} href={`/documentos?carpeta=${encodeURIComponent(f.id)}`} className="row grid min-h-[44px] items-center gap-x-3 px-3 py-1 text-fg" style={grid} role="row" title={`Abrir ${f.name}`}>
                    <span className="flex min-w-0 items-center gap-2.5" role="gridcell">
                      {carpeta ? <TipoTile tipo={CARPETA} /> : <span className="avatar h-8 w-8 text-[11px]">{initials(nombreDe(f)) || "?"}</span>}
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px] font-medium">{nombreDe(f)}</span>
                        {!carpeta && c && f.name !== c.full_name.toUpperCase() && <span className="truncate text-[11px] text-faint">{f.name}</span>}
                        {!carpeta && !c && <span className="truncate text-[11px] text-faint">Sin causa enlazada en Jurídico</span>}
                      </span>
                    </span>
                    {carpeta ? (
                      <>
                        <span className="text-[12px] text-muted" role="gridcell">Carpeta</span>
                        <span className="tabnum text-right text-[12px] text-muted" role="gridcell">—</span>
                      </>
                    ) : (
                      <>
                        <span className="tabnum text-[12px] text-soft" role="gridcell">{c?.rut ? formatRut(c.rut) : <span className="text-faint">—</span>}</span>
                        <span className="tabnum text-[12px] text-soft" role="gridcell">{c?.internal_number ?? <span className="text-faint">—</span>}</span>
                      </>
                    )}
                    <span className="tabnum text-right text-[12px] text-muted" role="gridcell">{fmtDate(f.modifiedTime)}</span>
                    <span className="flex justify-end text-faint" role="gridcell">
                      <Icon name="chevron" size={14} />
                    </span>
                  </Link>
                );
              const active = sel?.id === f.id;
              return (
                <button key={f.id} type="button" onClick={() => setSel(f)} className={`row relative grid min-h-[44px] w-full items-center gap-x-3 px-3 py-1 text-left text-fg ${active ? "bg-[color:var(--surface-active)]" : ""}`} style={grid} role="row" aria-selected={active} title={f.name}>
                  {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r" style={{ background: "var(--brand-dark)" }} aria-hidden />}
                  <span className="flex min-w-0 items-center gap-2.5" role="gridcell">
                    <TipoTile tipo={t} />
                    <span className={`truncate text-[13px] ${active ? "font-semibold" : "font-medium"}`}>{f.name}</span>
                  </span>
                  <span className="truncate text-[12px] text-muted" role="gridcell">{t.nombre}</span>
                  <span className="tabnum text-right text-[12px] text-muted" role="gridcell">{fmtSize(f.size)}</span>
                  <span className="tabnum text-right text-[12px] text-muted" role="gridcell">{fmtDate(f.modifiedTime)}</span>
                  <span className={`flex justify-end ${active ? "text-accent" : "text-faint"}`} role="gridcell">
                    <Icon name="eye" size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-1.5 text-[11.5px] text-faint" style={{ background: "var(--band)" }}>
          <span>
            {carpeta
              ? `${archivos.length} ${archivos.length === 1 ? "archivo" : "archivos"}${filas.length - archivos.length ? ` · ${filas.length - archivos.length} subcarpetas` : ""}`
              : `${filas.filter((f) => f.isFolder).length} ${filas.filter((f) => f.isFolder).length === 1 ? "cliente" : "clientes"}${archivos.length ? ` · ${archivos.length} archivos sueltos` : ""}`}
          </span>
          {archivos.length > 0 && (
            <span className="hidden items-center gap-1 2xl:flex">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd> recorrer · <kbd className="kbd">Esc</kbd> cerrar
            </span>
          )}
        </div>
      </section>

      {/* --------------------------------------------- Vista previa --------------------------------------------- */}
      <section className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Vista previa" aria-live="polite">
        {sel ? (
          <VistaPrevia key={sel.id} file={sel} onClose={() => setSel(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6" style={{ background: "var(--band)" }}>
            <div className="flex max-w-[360px] flex-col items-center gap-2.5 text-center">
              <span className="relative mb-2 flex h-[92px] w-[72px] items-end justify-center rounded-md border border-line bg-surface shadow-sm" aria-hidden>
                <span className="absolute left-3 right-3 top-4 h-1.5 rounded bg-[color:var(--border-soft)]" />
                <span className="absolute left-3 right-6 top-8 h-1.5 rounded bg-[color:var(--border-soft)]" />
                <span className="absolute left-3 right-4 top-12 h-1.5 rounded bg-[color:var(--border-soft)]" />
                <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: "var(--brand-dark)" }}>
                  <Icon name="eye" size={14} />
                </span>
              </span>
              <span className="text-[14px] font-semibold text-fg">Vista previa</span>
              <span className="text-[12.5px] leading-relaxed text-muted">{carpeta ? "Elige un archivo de la lista y se verá aquí, sin salir de la carpeta." : "Elige un cliente a la izquierda y luego un archivo para verlo aquí."}</span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
                <span className="inline-flex items-center gap-1">
                  <TipoTile tipo={tipoDe({ mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", isFolder: false })} size="sm" /> Word
                </span>
                <span className="inline-flex items-center gap-1">
                  <TipoTile tipo={tipoDe({ mimeType: "application/pdf", isFolder: false })} size="sm" /> PDF
                </span>
                <span className="inline-flex items-center gap-1">
                  <TipoTile tipo={tipoDe({ mimeType: "image/jpeg", isFolder: false })} size="sm" /> Imágenes
                </span>
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const ZOOMS = [0.6, 0.75, 0.9, 1, 1.15, 1.3];

/** Panel derecho: barra con el archivo, zoom y acciones, y el contenido dibujado por la app (Word, PDF, imagen) o por el Drive. */
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
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <TipoTile tipo={t} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-semibold text-fg" title={file.name}>
            {file.name}
          </span>
          <span className="truncate text-[11.5px] text-muted">
            {t.nombre}
            {pages ? ` · ${pages} ${pages === 1 ? "página" : "páginas"}` : ""}
            {file.size != null ? ` · ${fmtSize(file.size)}` : ""} · modificado {fmtDate(file.modifiedTime).toLowerCase()}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {t.render === "word" && (
            <span className="mr-1 inline-flex items-center rounded-md border border-line" role="group" aria-label="Zoom">
              <button type="button" className="icon-btn plain !h-7 !w-7" onClick={menos} disabled={efectivo <= ZOOMS[0] + 0.01} aria-label="Alejar" title="Alejar">
                −
              </button>
              <button type="button" className={`tabnum min-w-[48px] px-1 text-[11.5px] ${zoom === "fit" ? "text-accent" : "text-soft"}`} onClick={() => setZoom(zoom === "fit" ? 1 : "fit")} title={zoom === "fit" ? "Ajustado al ancho · clic para tamaño real" : "Clic para ajustar al ancho"}>
                {Math.round(efectivo * 100)}%
              </button>
              <button type="button" className="icon-btn plain !h-7 !w-7" onClick={mas} disabled={efectivo >= ZOOMS[ZOOMS.length - 1] - 0.01} aria-label="Acercar" title="Acercar">
                +
              </button>
            </span>
          )}
          <a href={`${fileUrl(file.id)}?descargar=1`} className="btn-secondary btn-sm" title="Descargar el archivo">
            <Icon name="download" size={13} /> Descargar
          </a>
          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="Abrir en Google Drive">
            <Icon name="external" size={13} /> Drive
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

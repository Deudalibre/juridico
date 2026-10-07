"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DocxRender } from "@/components/DocxRender";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import type { DriveFile, DriveFolder } from "@/lib/google";

export type ClienteCarpeta = { id: string; full_name: string; rut: string | null; internal_number: string | null; cerrada: boolean };

type Props = { items: DriveFile[]; carpeta: DriveFolder | null; root: DriveFolder; clientes: Record<string, ClienteCarpeta>; archivoId: string | null; q: string };
type Orden = "nombre" | "fecha";

/** Contenido servido por la app con su propia conexión al Drive (no hace falta iniciar sesión en Google) */
const fileUrl = (id: string) => `/api/drive/file/${encodeURIComponent(id)}`;
/** Para lo que la app no sabe dibujar (vídeos, archivos raros): la vista previa del propio Drive */
const drivePreviewUrl = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = (a: Date, b: Date) => a.toLocaleDateString("es-CL", { timeZone: "America/Santiago" }) === b.toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
  const ayer = new Date(hoy.getTime() - 86400000);
  const hora = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
  if (mismoDia(d, hoy)) return `hoy ${hora}`;
  if (mismoDia(d, ayer)) return `ayer ${hora}`;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: d.getFullYear() === hoy.getFullYear() ? undefined : "numeric", timeZone: "America/Santiago" });
};

/** Tipo de archivo: etiqueta corta, nombre y colores de la ficha (una familia por tipo, sin inventar paleta nueva). */
type Tipo = { tag: string; nombre: string; bg: string; fg: string; render: "word" | "pdf" | "imagen" | "drive" };
const tipoDe = (m: string): Tipo => {
  if (/wordprocessingml\.document$|msword$/.test(m)) return { tag: "DOC", nombre: "Word", bg: "var(--surface-active)", fg: "var(--brand-dark)", render: "word" };
  if (m === "application/pdf") return { tag: "PDF", nombre: "PDF", bg: "var(--danger-bg)", fg: "var(--danger)", render: "pdf" };
  if (m.startsWith("image/")) return { tag: "IMG", nombre: "Imagen", bg: "var(--success-bg)", fg: "var(--success)", render: "imagen" };
  if (m === "application/vnd.google-apps.document") return { tag: "GDOC", nombre: "Documento de Google", bg: "var(--surface-active)", fg: "var(--brand-dark)", render: "pdf" };
  if (m === "application/vnd.google-apps.spreadsheet" || /spreadsheetml|ms-excel/.test(m)) return { tag: "XLS", nombre: "Planilla", bg: "var(--success-bg)", fg: "var(--success)", render: m.startsWith("application/vnd.google-apps.") ? "pdf" : "drive" };
  if (m.startsWith("video/")) return { tag: "VID", nombre: "Vídeo", bg: "var(--warning-bg)", fg: "var(--warning)", render: "drive" };
  return { tag: "ARCH", nombre: "Archivo", bg: "var(--band)", fg: "var(--text-faint)", render: "drive" };
};

function TipoTile({ tipo, size = "md" }: { tipo: Tipo; size?: "md" | "sm" }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-wide ${size === "md" ? "h-9 w-9 text-[10px]" : "h-7 w-7 text-[9px]"}`}
      style={{ background: tipo.bg, color: tipo.fg }}
      aria-hidden
    >
      {tipo.tag}
    </span>
  );
}

/**
 * Gestor de archivos en dos paneles: a la izquierda la lista (carpetas de clientes en la raíz; archivos dentro de una
 * carpeta) con migas de pan, orden y teclado; a la derecha la vista previa del archivo elegido con su barra de
 * herramientas. Elegir un archivo no recarga la página.
 */
export function CarpetaUniversal({ items, carpeta, root, clientes, archivoId, q }: Props) {
  // La página monta este componente con key = carpeta, así que al cambiar de carpeta la selección empieza de cero
  const [sel, setSel] = useState<DriveFile | null>(() => items.find((f) => f.id === archivoId && !f.isFolder) ?? null);
  const [orden, setOrden] = useState<Orden>(carpeta ? "fecha" : "nombre");

  const porOrden = (a: DriveFile, b: DriveFile) => (orden === "nombre" ? a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" }) : Date.parse(b.modifiedTime) - Date.parse(a.modifiedTime));
  const folders = useMemo(() => items.filter((f) => f.isFolder).sort(porOrden), [items, orden]); // eslint-disable-line react-hooks/exhaustive-deps
  const files = useMemo(() => items.filter((f) => !f.isFolder).sort(porOrden), [items, orden]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumen = carpeta
    ? `${files.length} ${files.length === 1 ? "archivo" : "archivos"}${folders.length ? ` · ${folders.length} ${folders.length === 1 ? "subcarpeta" : "subcarpetas"}` : ""}`
    : `${folders.length} ${folders.length === 1 ? "cliente" : "clientes"}${files.length ? ` · ${files.length} ${files.length === 1 ? "archivo suelto" : "archivos sueltos"}` : ""}`;

  // Flechas arriba/abajo recorren los archivos; Escape cierra la vista previa
  const onKey = (e: React.KeyboardEvent) => {
    if (!files.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = sel ? files.findIndex((f) => f.id === sel.id) : -1;
      const next = e.key === "ArrowDown" ? Math.min(files.length - 1, i + 1) : Math.max(0, i - 1);
      setSel(files[next]);
    } else if (e.key === "Escape") setSel(null);
  };

  const cliente = carpeta ? clientes[carpeta.id] : undefined;

  return (
    <div className="grid min-h-0 gap-3" style={{ gridTemplateColumns: "minmax(300px, 380px) minmax(0, 1fr)", height: "calc(100vh - 150px)" }}>
      {/* ------------------------------------------------ Lista ------------------------------------------------ */}
      <section className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Carpetas y archivos">
        {/* Migas de pan */}
        <nav className="flex items-center gap-1 border-b border-line px-3 py-2 text-[12.5px]" aria-label="Ruta" style={{ background: "var(--band)" }}>
          {carpeta ? (
            <>
              <Link href="/documentos" className="icon-btn plain" aria-label="Volver a todas las carpetas" title="Todas las carpetas">
                <span className="inline-flex rotate-180">
                  <Icon name="chevron" size={14} />
                </span>
              </Link>
              <Link href="/documentos" className="truncate text-muted hover:text-fg hover:underline" title={root.name}>
                {root.name}
              </Link>
              <Icon name="chevron" size={12} />
              <span className="truncate font-semibold text-fg" title={carpeta.name}>
                {carpeta.name}
              </span>
            </>
          ) : (
            <>
              <span className="icon-tile !h-6 !w-6">
                <Icon name="folder" size={12} />
              </span>
              <span className="truncate font-semibold text-fg" title={root.name}>
                {root.name}
              </span>
            </>
          )}
        </nav>

        {/* Quién es (dentro de la carpeta de un cliente) */}
        {carpeta && (
          <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
            <span className="avatar h-9 w-9 text-[12px]">{initials(cliente?.full_name ?? carpeta.name) || "?"}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] font-semibold text-fg">{cliente?.full_name ?? carpeta.name}</span>
              <span className="truncate text-[11.5px] text-muted">
                {cliente ? (
                  <>
                    {cliente.rut ? <span className="tabnum">RUT {formatRut(cliente.rut)}</span> : "RUT pendiente"}
                    {cliente.internal_number ? <span className="tabnum"> · N° {cliente.internal_number}</span> : null}
                    {cliente.cerrada ? " · causa cerrada" : null}
                  </>
                ) : (
                  "Carpeta sin causa enlazada en Jurídico"
                )}
              </span>
            </span>
            {cliente && (
              <Link href={`/documentos/lvs/${cliente.id}`} className="btn-outline btn-sm shrink-0" title="Abrir el expediente LVS">
                <Icon name="report" size={13} /> Expediente
              </Link>
            )}
          </div>
        )}

        {/* Barra: cuenta y orden */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px] text-muted">
          <span>{resumen}</span>
          <label className="flex items-center gap-1.5">
            <span className="sr-only">Ordenar por</span>
            <Icon name="sort" size={12} />
            <select className="input !min-h-[26px] !w-auto !border-0 !bg-transparent !px-1 !py-0 text-[12px]" value={orden} onChange={(e) => setOrden(e.target.value as Orden)} aria-label="Ordenar por">
              <option value="nombre">Nombre</option>
              <option value="fecha">Más recientes</option>
            </select>
          </label>
        </div>

        {/* Filas */}
        {items.length === 0 ? (
          <div className="empty flex-1">
            <span className="icon-tile">
              <Icon name={q ? "search" : "folder"} />
            </span>
            <span className="empty-title">{q ? "Sin resultados" : carpeta ? "Carpeta vacía" : "Todavía no hay carpetas de clientes"}</span>
            <span className="empty-text">{q ? "Prueba con otro nombre o RUT." : carpeta ? "Los documentos que generes para este cliente aparecerán aquí." : "Se crean solas al generar el primer documento de cada solicitud LVS."}</span>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto outline-none" tabIndex={0} onKeyDown={onKey} role="listbox" aria-label={carpeta ? "Archivos" : "Carpetas de clientes"}>
            {folders.map((f) => {
              const c = clientes[f.id];
              return (
                <Link key={f.id} href={`/documentos?carpeta=${encodeURIComponent(f.id)}`} className="row flex min-h-[52px] items-center gap-3 px-3 py-1.5 text-fg" title={`Abrir ${f.name}`} role="option" aria-selected={false}>
                  {carpeta ? (
                    <span className="icon-tile !h-9 !w-9">
                      <Icon name="folder" size={16} />
                    </span>
                  ) : (
                    <span className="avatar h-9 w-9 text-[12px]">{initials(c?.full_name ?? f.name) || "?"}</span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-semibold">{f.name}</span>
                    <span className="truncate text-[11.5px] text-muted">
                      {c ? (
                        <>
                          {c.rut ? <span className="tabnum">{formatRut(c.rut)}</span> : "RUT pendiente"}
                          {c.internal_number ? <span className="tabnum"> · N° {c.internal_number}</span> : null}
                          {c.cerrada ? <span className="text-faint"> · cerrada</span> : null}
                        </>
                      ) : (
                        <>Carpeta · {fmtDate(f.modifiedTime)}</>
                      )}
                    </span>
                  </span>
                  <span className="text-faint">
                    <Icon name="chevron" size={14} />
                  </span>
                </Link>
              );
            })}
            {files.map((f) => {
              const active = sel?.id === f.id;
              const t = tipoDe(f.mimeType);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSel(f)}
                  role="option"
                  aria-selected={active}
                  className={`row relative flex min-h-[52px] w-full items-center gap-3 px-3 py-1.5 text-left text-fg ${active ? "bg-[color:var(--surface-active)]" : ""}`}
                  title={f.name}
                >
                  {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-r" style={{ background: "var(--brand-dark)" }} aria-hidden />}
                  <TipoTile tipo={t} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-[13px] ${active ? "font-semibold" : "font-medium"}`}>{f.name}</span>
                    <span className="truncate text-[11.5px] text-muted">
                      {t.nombre}
                      {f.size != null ? ` · ${fmtSize(f.size)}` : ""} · {fmtDate(f.modifiedTime)}
                    </span>
                  </span>
                  <span className={active ? "text-accent" : "text-faint"}>
                    <Icon name="eye" size={14} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* --------------------------------------------- Vista previa --------------------------------------------- */}
      <section className="panel flex min-h-0 min-w-0 flex-col overflow-hidden" aria-label="Vista previa" aria-live="polite">
        {sel ? (
          <VistaPrevia key={sel.id} file={sel} onClose={() => setSel(null)} />
        ) : (
          <div className="flex flex-1 items-center justify-center p-6" style={{ background: "var(--band)" }}>
            <div className="flex max-w-[380px] flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-8 py-10 text-center">
              <span className="icon-tile">
                <Icon name="eye" />
              </span>
              <span className="text-[14px] font-semibold text-fg">Vista previa</span>
              <span className="text-[12.5px] text-muted">{carpeta ? "Elige un archivo de la lista y se verá aquí sin salir de la carpeta." : "Entra en la carpeta de un cliente y elige un archivo para verlo aquí."}</span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-[11.5px] text-faint">
                <TipoTile tipo={tipoDe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")} size="sm" /> Word
                <TipoTile tipo={tipoDe("application/pdf")} size="sm" /> PDF
                <TipoTile tipo={tipoDe("image/jpeg")} size="sm" /> Imágenes
              </span>
              {carpeta && files.length > 0 && (
                <span className="text-[11.5px] text-faint">
                  <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> para recorrer los archivos
                </span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Panel derecho: barra con el archivo y sus acciones, y el contenido dibujado por la app (Word, PDF, imagen) o por el Drive. */
function VistaPrevia({ file, onClose }: { file: DriveFile; onClose: () => void }) {
  const t = tipoDe(file.mimeType);
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
            {file.size != null ? ` · ${fmtSize(file.size)}` : ""} · modificado {fmtDate(file.modifiedTime)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
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
      <Contenido file={file} tipo={t} />
    </>
  );
}

function Contenido({ file, tipo }: { file: DriveFile; tipo: Tipo }) {
  if (tipo.render === "word") return <DocxRender url={fileUrl(file.id)} className="min-h-0 flex-1" />;
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

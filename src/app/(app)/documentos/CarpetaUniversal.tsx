"use client";

import Link from "next/link";
import { useState } from "react";
import { DocxRender } from "@/components/DocxRender";
import { Icon } from "@/components/icons";
import type { DriveFile, DriveFolder } from "@/lib/google";

type Props = { items: DriveFile[]; carpeta: DriveFolder | null; rootName: string; archivoId: string | null; q: string };

/** Contenido servido por la app con su propia conexión al Drive (no hace falta iniciar sesión en Google) */
const fileUrl = (id: string) => `/api/drive/file/${encodeURIComponent(id)}`;
/** Para lo que la app no sabe dibujar (vídeos, archivos raros): la vista previa del propio Drive */
const drivePreviewUrl = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
const isWord = (m: string) => /wordprocessingml\.document$/.test(m);
const isPdf = (m: string) => m === "application/pdf" || m.startsWith("application/vnd.google-apps.");
const isImage = (m: string) => m.startsWith("image/");

/** Panel derecho: Word dibujado en la app, PDF e imágenes servidos por la app, el resto con el visor del Drive. */
function Preview({ file }: { file: DriveFile }) {
  if (isWord(file.mimeType)) return <DocxRender url={fileUrl(file.id)} className="min-h-[560px] flex-1" />;
  if (isPdf(file.mimeType)) return <iframe src={fileUrl(file.id)} title={`Vista previa de ${file.name}`} className="h-full min-h-[560px] w-full flex-1 border-0" />;
  if (isImage(file.mimeType))
    return (
      <div className="flex flex-1 items-start justify-center overflow-auto bg-[color:var(--band)] p-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen servida por la app, tamaño desconocido */}
        <img src={fileUrl(file.id)} alt={file.name} className="max-w-full rounded-md shadow-sm" />
      </div>
    );
  return <iframe src={drivePreviewUrl(file.id)} title={`Vista previa de ${file.name}`} className="h-full min-h-[560px] w-full flex-1 border-0" allow="autoplay" />;
}
const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Santiago" });
const kind = (f: DriveFile) => (f.isFolder ? "Carpeta" : /wordprocessingml|msword/.test(f.mimeType) ? "Word" : /pdf/.test(f.mimeType) ? "PDF" : /image\//.test(f.mimeType) ? "Imagen" : /spreadsheet|excel/.test(f.mimeType) ? "Planilla" : /google-apps\.document/.test(f.mimeType) ? "Documento de Google" : "Archivo");

/**
 * Dos paneles: a la izquierda la lista (carpetas de clientes en la raíz; archivos dentro de una carpeta), a la
 * derecha la vista previa del archivo elegido, incrustada desde el Drive. Elegir un archivo no recarga la página.
 */
export function CarpetaUniversal({ items, carpeta, rootName, archivoId, q }: Props) {
  // La página monta este componente con key = carpeta, así que al cambiar de carpeta la selección empieza de cero
  const [sel, setSel] = useState<DriveFile | null>(() => items.find((f) => f.id === archivoId && !f.isFolder) ?? null);

  const folders = items.filter((f) => f.isFolder);
  const files = items.filter((f) => !f.isFolder);
  const titulo = carpeta ? carpeta.name : rootName;
  const resumen = carpeta
    ? `${files.length} ${files.length === 1 ? "archivo" : "archivos"}${folders.length ? ` · ${folders.length} ${folders.length === 1 ? "subcarpeta" : "subcarpetas"}` : ""}`
    : `${folders.length} ${folders.length === 1 ? "cliente" : "clientes"}${files.length ? ` · ${files.length} ${files.length === 1 ? "archivo suelto" : "archivos sueltos"}` : ""}`;

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-3" style={{ gridTemplateColumns: "minmax(280px, 2fr) minmax(0, 3fr)" }}>
      <section className="panel flex min-w-0 flex-col overflow-hidden">
        <div className="panel-head !py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <Icon name="folder" size={14} />
            <span className="card-title truncate">{titulo}</span>
          </span>
          <span className="shrink-0 text-[12px] text-muted">{resumen}</span>
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{q ? "Sin resultados" : carpeta ? "Carpeta vacía" : "Todavía no hay carpetas de clientes"}</span>
            <span className="empty-text">{q ? "Prueba con otro nombre." : carpeta ? "Los documentos que generes para este cliente aparecerán aquí." : "Se crean solas al generar el primer documento de cada solicitud LVS."}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {folders.map((f) => (
              <Link key={f.id} href={`/documentos?carpeta=${encodeURIComponent(f.id)}`} className="row flex min-h-[44px] items-center gap-3 px-4 py-1.5 text-fg" title={`Abrir ${f.name}`}>
                <span className="icon-tile !h-8 !w-8 shrink-0">
                  <Icon name="folder" size={15} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-semibold">{f.name}</span>
                  <span className="text-[11.5px] text-muted">Carpeta · {fmtDate(f.modifiedTime)}</span>
                </span>
                <Icon name="chevron" size={14} />
              </Link>
            ))}
            {files.map((f) => {
              const active = sel?.id === f.id;
              return (
                <button key={f.id} type="button" onClick={() => setSel(f)} aria-pressed={active} className={`row flex min-h-[44px] w-full items-center gap-3 px-4 py-1.5 text-left text-fg ${active ? "bg-[color:var(--surface-active)]" : ""}`} title={`Ver ${f.name}`}>
                  <span className={`icon-tile !h-8 !w-8 shrink-0 ${active ? "solid" : ""}`}>
                    <Icon name="report" size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{f.name}</span>
                    <span className="text-[11.5px] text-muted">
                      {kind(f)}
                      {f.size != null ? ` · ${fmtSize(f.size)}` : ""} · {fmtDate(f.modifiedTime)}
                    </span>
                  </span>
                  <Icon name="eye" size={14} />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel flex min-w-0 flex-col overflow-hidden">
        {sel ? (
          <>
            <div className="panel-head !py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="eye" size={14} />
                <span className="card-title truncate">{sel.name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <a href={`${fileUrl(sel.id)}?descargar=1`} className="btn-secondary btn-sm" title="Descargar el archivo">
                  <Icon name="download" size={13} /> Descargar
                </a>
                <a href={sel.webViewLink} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="Abrir en Google Drive">
                  <Icon name="external" size={13} /> Abrir en Drive
                </a>
                <button type="button" className="icon-btn plain" onClick={() => setSel(null)} aria-label="Cerrar vista previa">
                  <Icon name="close" size={15} />
                </button>
              </span>
            </div>
            <Preview key={sel.id} file={sel} />
          </>
        ) : (
          <div className="empty flex-1">
            <span className="icon-tile">
              <Icon name="eye" />
            </span>
            <span className="empty-title">Vista previa</span>
            <span className="empty-text">{carpeta ? "Elige un archivo de la lista para verlo aquí sin salir de la carpeta." : "Entra en la carpeta de un cliente y elige un archivo para verlo aquí."}</span>
          </div>
        )}
      </section>
    </div>
  );
}

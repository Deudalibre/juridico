"use client";

import { useState } from "react";
import { DocxRender } from "@/components/DocxRender";
import { Modal } from "@/components/ui/Dialog";
import { Icon } from "@/components/icons";

type Props = {
  title: string;
  fileName: string;
  /** Enlace temporal al Word rellenado (vive en una carpeta de vistas previas; no se ha generado nada todavía) */
  url: string;
  advertencias: string[];
  /** null = solo mirar (sin permiso para generar) */
  onGenerate: (() => void) | null;
  generating: boolean;
  /** Ya existe una versión: el botón dice «Generar de nuevo» */
  exists: boolean;
  onClose: () => void;
};

/**
 * La lupa: muestra el documento tal como va a quedar (docx-preview dibuja el Word con sus fuentes, márgenes y
 * páginas) antes de generarlo. Desde aquí mismo se confirma «Generar y guardar en el Drive».
 */
export function PreviewDialog({ title, fileName, url, advertencias, onGenerate, generating, exists, onClose }: Props) {
  const [ready, setReady] = useState(false);

  return (
    <Modal title={title} subtitle={fileName} onClose={onClose} busy={generating} size="lg" hideTitle>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="icon-tile solid !h-7 !w-7">
              <Icon name="eye" size={14} />
            </span>
            <span className="card-title truncate">{title}</span>
          </span>
          <span className="truncate text-[12.5px] text-muted">{fileName} · así va a quedar; todavía no se ha guardado nada</span>
        </div>
        <button type="button" className="icon-btn plain shrink-0" onClick={onClose} aria-label="Cerrar vista previa" disabled={generating}>
          <Icon name="close" size={16} />
        </button>
      </div>

      {advertencias.length > 0 && (
        <div className="flex items-start gap-2 rounded-md px-3 py-2 text-[12.5px]" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
          <Icon name="alert" size={14} />
          <span className="flex flex-col gap-0.5">
            {advertencias.map((a, i) => (
              <span key={i}>{a}</span>
            ))}
          </span>
        </div>
      )}

      <DocxRender url={url} onReady={setReady} className="max-h-[calc(100vh-240px)] min-h-[320px] rounded-md border border-line" />

      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-faint">Se guarda en el almacén de la app y en la carpeta del cliente del Drive.</span>
        <span className="flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={onClose} disabled={generating}>
            Cerrar
          </button>
          {onGenerate && (
            <button type="button" className="btn-primary btn-sm" onClick={onGenerate} disabled={generating || !ready}>
              {generating ? "Generando…" : exists ? "Generar de nuevo y guardar" : "Generar y guardar en el Drive"}
            </button>
          )}
        </span>
      </div>
    </Modal>
  );
}

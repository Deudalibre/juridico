"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  /** Avisa al terminar: si salió bien, cuántas páginas y qué zoom ajusta la hoja al ancho del marco */
  onReady?: (ok: boolean, pages: number, fit: number) => void;
  /** Número (1 = tamaño real) o «fit» para ajustar la hoja al ancho disponible */
  zoom?: number | "fit";
  className?: string;
};

const PAD = 32; // margen lateral de .docx-wrapper (16 px por lado)

/**
 * Dibuja un Word tal cual (docx-preview: fuentes, márgenes, páginas) a partir de un enlace. Lo comparten la lupa del
 * expediente LVS y la vista previa de la carpeta universal. Avisa cuántas páginas dibujó y admite zoom (o ajuste al ancho).
 */
export function DocxRender({ url, onReady, zoom = "fit", className = "" }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [fit, setFit] = useState(1);

  /** Zoom que deja la hoja completa dentro del marco (nunca más grande que el tamaño real). */
  const calcFit = () => {
    const page = bodyRef.current?.querySelector<HTMLElement>("section.docx");
    const frame = frameRef.current;
    if (!page || !frame) return 1;
    const w = page.offsetWidth || 816;
    return Math.min(1, Math.max(0.3, Math.floor(((frame.clientWidth - PAD) / w) * 100) / 100));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`No se pudo descargar el Word (${res.status}).`);
        const blob = await res.blob();
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !bodyRef.current || !styleRef.current) return;
        bodyRef.current.innerHTML = "";
        styleRef.current.innerHTML = "";
        await renderAsync(blob, bodyRef.current, styleRef.current, {
          className: "docx",
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          experimental: true,
          useBase64URL: true,
          ignoreLastRenderedPageBreak: true,
        });
        if (cancelled) return;
        const f = calcFit();
        setFit(f);
        setStatus("ready");
        onReady?.(true, bodyRef.current.querySelectorAll("section.docx").length, f);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError((e as Error).message);
        onReady?.(false, 0, 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo se vuelve a dibujar cuando cambia el enlace
  }, [url]);

  // Si cambia el ancho del marco (ventana, paneles), el ajuste al ancho se recalcula
  useEffect(() => {
    if (status !== "ready" || !frameRef.current) return;
    const ro = new ResizeObserver(() => setFit(calcFit()));
    ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [status]);

  return (
    <div ref={frameRef} className={`relative overflow-auto bg-[color:var(--band)] ${className}`}>
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[13px] text-muted" aria-live="polite">
          <span className="h-[220px] w-[170px] animate-pulse rounded-md border border-line bg-surface" aria-hidden />
          Dibujando el documento…
        </div>
      )}
      {status === "error" && <div className="px-4 py-8 text-center text-[13px] text-danger">No se pudo dibujar el Word: {error}</div>}
      <div ref={styleRef} />
      <div ref={bodyRef} style={{ zoom: zoom === "fit" ? fit : zoom }} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dibuja un Word tal cual (docx-preview: fuentes, márgenes, páginas) a partir de un enlace. Lo comparten la lupa del
 * expediente LVS y la vista previa de la carpeta universal.
 */
export function DocxRender({ url, onReady, className = "" }: { url: string; onReady?: (ok: boolean) => void; className?: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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
        setStatus("ready");
        onReady?.(true);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError((e as Error).message);
        onReady?.(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo se vuelve a dibujar cuando cambia el enlace
  }, [url]);

  return (
    <div className={`relative overflow-auto bg-[color:var(--band)] ${className}`}>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted" aria-live="polite">
          Dibujando el documento…
        </div>
      )}
      {status === "error" && <div className="px-4 py-8 text-center text-[13px] text-danger">No se pudo dibujar el Word: {error}</div>}
      <div ref={styleRef} />
      <div ref={bodyRef} />
    </div>
  );
}

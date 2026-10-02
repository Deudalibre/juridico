"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Block, DocModel, Para } from "@/lib/docx";
import { VAR_RE } from "@/lib/templates";

/** Qué mostrar en lugar de cada marcador {nombre} del Word. */
export type ChipRender = (name: string) => { text: string; tone: "ok" | "missing" | "undefined"; title: string };
export type Hit = { p: number; start: number; end: number; text: string; x: number; y: number };
/** Clic sin seleccionar: punto del párrafo donde insertar una variable */
export type Caret = { p: number; pos: number; x: number; y: number };

type Props = {
  /** Cambia al guardar: vuelve a traer el .docx y lo dibuja de nuevo */
  version: number;
  doc: DocModel;
  mode: "marcas" | "datos";
  chip: ChipRender;
  /** Cuenta de dependencias de los chips (valores, variables): al cambiar se vuelven a pintar sin recargar el Word */
  chipKey: string;
  canSelect: boolean;
  getUrl: () => Promise<{ url?: string; error?: string }>;
  /** Marco que posiciona el popover: las coordenadas del clic se devuelven relativas a él */
  frameRef: RefObject<HTMLDivElement | null>;
  onPick: (hit: Hit) => void;
  onCaret: (hit: Caret) => void;
  onClear: () => void;
  onNotice: (msg: string, error?: boolean) => void;
  /** docx-preview no pudo con el archivo: el editor vuelve a su dibujo propio */
  onFallback: (reason: string) => void;
};

const CHIP = "docx-var mx-[1px] inline rounded-[4px] px-1 py-[1px] font-sans text-[12.5px] font-medium";
const TONE: Record<"ok" | "missing" | "undefined", string> = {
  ok: "bg-[color:var(--surface-active)] text-accent",
  missing: "bg-[color:var(--warning-bg)] text-warning",
  undefined: "bg-[color:var(--surface-active)] text-accent outline outline-1 outline-dashed outline-current",
};

/** Párrafos del modelo en el mismo orden en que aparecen en el Word (tablas incluidas). */
function flatten(blocks: Block[], out: Para[] = []): Para[] {
  for (const b of blocks) {
    if (b.kind === "p") out.push(b);
    else for (const row of b.rows) for (const cell of row) flatten(cell, out);
  }
  return out;
}

/** Texto de un <p> dibujado por docx-preview con la misma convención que el modelo: tab = \t, salto = \n. */
function domText(el: Node): string {
  let s = "";
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) s += (n.textContent ?? "").replace(/ /g, "\t");
    else if (n.nodeName === "BR") s += "\n";
    else s += domText(n);
  });
  return s;
}

/** Posición (en caracteres del párrafo) de un punto de la selección. */
function offsetIn(p: HTMLElement, node: Node, offset: number): number {
  let pos = 0;
  let done = false;
  const walk = (n: Node) => {
    if (done) return;
    if (n === node) {
      if (n.nodeType === Node.TEXT_NODE) pos += Math.min(offset, (n.textContent ?? "").length);
      else {
        // Punto en un elemento: offset = número de hijos anteriores
        const kids = Array.from(n.childNodes).slice(0, offset);
        for (const k of kids) pos += domText(k).length;
      }
      done = true;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) pos += (n.textContent ?? "").replace(/ /g, "\t").length;
    else if (n.nodeName === "BR") pos += 1;
    else n.childNodes.forEach(walk);
  };
  walk(p);
  return pos;
}

/**
 * Vista del Word tal cual (docx-preview dibuja el .docx con sus fuentes, tamaños, márgenes y páginas) sobre la que
 * se selecciona texto para convertirlo en variable. Los marcadores {nombre} se pintan como fichas; en modo «datos»
 * muestran el valor del cliente. La selección se traduce a párrafo + posiciones del modelo comparando el texto.
 */
export function DocxView({ version, doc, mode, chip, chipKey, canSelect, getUrl, frameRef, onPick, onCaret, onClear, onNotice, onFallback }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  // Reintento manual: en desarrollo la primera apertura puede tardar (compila docx-preview) y conviene poder repetir
  const [attempt, setAttempt] = useState(0);
  const [slow, setSlow] = useState(false);

  // Quita las fichas (vuelven a ser el texto {nombre}) y las vuelve a pintar con el modo/valores actuales
  const decorate = () => {
    const body = bodyRef.current;
    if (!body) return;
    body.querySelectorAll<HTMLElement>(".docx-var").forEach((el) => el.replaceWith(document.createTextNode(`{${el.dataset.name}}`)));
    body.normalize();
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (VAR_RE.test(n.textContent ?? "")) nodes.push(n as Text);
    VAR_RE.lastIndex = 0;
    for (const node of nodes) {
      const text = node.textContent ?? "";
      const frag = document.createDocumentFragment();
      let pos = 0;
      const re = new RegExp(VAR_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m.index > pos) frag.appendChild(document.createTextNode(text.slice(pos, m.index)));
        const c = chip(m[1]);
        const span = document.createElement("span");
        span.className = `${CHIP} ${TONE[c.tone]}`;
        span.dataset.name = m[1];
        span.title = c.title;
        span.textContent = mode === "datos" ? c.text : `{${m[1]}}`;
        frag.appendChild(span);
        pos = m.index + m[0].length;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.replaceWith(frag);
    }
  };

  // Carga y dibuja el Word cada vez que cambia la versión (o se pide reintentar)
  useEffect(() => {
    let cancelled = false;
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 15000);
    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const r = await getUrl();
        if (r.error || !r.url) throw new Error(r.error ?? "No se pudo obtener el archivo.");
        const res = await fetch(r.url);
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
        clearTimeout(slowTimer);
        decorate();
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setError((e as Error).message);
        onFallback((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, attempt]);

  // Cambia el modo o los valores: se repintan las fichas sin recargar
  useEffect(() => {
    if (status === "ready") decorate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chipKey, status]);

  /**
   * Párrafo del modelo que corresponde a un <p> dibujado. Por posición cuando el cuerpo tiene tantos <p> como
   * el modelo y el texto coincide; si no, por texto igual (y el enésimo si hay repetidos). Encabezados y pies
   * de página quedan fuera: no están en el modelo.
   */
  const resolvePara = (pEl: HTMLElement): Para | null => {
    const body = bodyRef.current;
    if (!body) return null;
    const model = flatten(doc.blocks);
    const bodyParas = Array.from(body.querySelectorAll<HTMLElement>("section.docx article p"));
    const text = domText(pEl);
    const idx = bodyParas.indexOf(pEl);
    if (idx >= 0 && bodyParas.length === model.length && model[idx] && model[idx].text === text) return model[idx];
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    let candidates = model.filter((m) => m.text === text);
    let exact = true;
    if (candidates.length === 0) {
      candidates = model.filter((m) => norm(m.text) === norm(text));
      exact = false;
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const all = bodyParas.filter((el) => (exact ? domText(el) === text : norm(domText(el)) === norm(text)));
    const nth = all.indexOf(pEl);
    return candidates[Math.max(0, Math.min(nth, candidates.length - 1))];
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!canSelect || mode !== "marcas" || status !== "ready") return;
    const target = e.target as HTMLElement;
    if (target.closest?.(".docx-var")) return onClear();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return onClear();
    const range = selection.getRangeAt(0);
    const toP = (n: Node) => (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement))?.closest<HTMLElement>("p") ?? null;
    let pEl = toP(range.startContainer);
    let atCellEnd = false;
    if (!pEl && selection.isCollapsed) {
      // Clic en una celda de tabla (fuera del texto): el punto es el final del primer párrafo de la celda
      const cellP = target.closest?.("td")?.querySelector<HTMLElement>("p") ?? null;
      if (cellP) {
        pEl = cellP;
        atCellEnd = true;
      }
    }
    if (!pEl || !bodyRef.current?.contains(pEl)) return onClear();
    if (pEl.closest("header, footer")) {
      onNotice("Los encabezados y pies de página no se marcan desde aquí.", true);
      return onClear();
    }
    const box = frameRef.current?.getBoundingClientRect();
    const x = e.clientX - (box?.left ?? 0);
    const y = e.clientY - (box?.top ?? 0) + (frameRef.current?.scrollTop ?? 0);
    const para = resolvePara(pEl);
    if (!para) {
      onNotice("No se pudo ubicar ese párrafo en el Word (puede estar dentro de un cuadro de texto o un campo). Prueba con otro punto.", true);
      return onClear();
    }
    if (selection.isCollapsed) {
      // Clic sin selección: insertar una variable en ese punto
      const pos = atCellEnd ? para.text.length : Math.max(0, Math.min(offsetIn(pEl, range.startContainer, range.startOffset), para.text.length));
      return onCaret({ p: para.i, pos, x, y });
    }
    if (toP(range.endContainer) !== pEl) {
      onNotice("Selecciona texto dentro de un mismo párrafo.", true);
      return onClear();
    }
    let start = offsetIn(pEl, range.startContainer, range.startOffset);
    let end = offsetIn(pEl, range.endContainer, range.endOffset);
    if (start > end) [start, end] = [end, start];
    const selected = range.toString().replace(/\u2003/g, "\t");
    if (para.text.slice(start, end) !== selected) {
      // Las posiciones no coinciden (espacios distintos, símbolos): se busca el texto seleccionado en el párrafo
      const idx = para.text.indexOf(selected);
      if (idx < 0 || para.text.indexOf(selected, idx + 1) >= 0) {
        onNotice("No se pudo ubicar con precisión el texto seleccionado. Selecciona un tramo más largo o distinto.", true);
        return onClear();
      }
      start = idx;
      end = idx + selected.length;
    }
    while (start < end && /\s/.test(para.text[start])) start++;
    while (end > start && /\s/.test(para.text[end - 1])) end--;
    if (end <= start) return onClear();
    const picked = para.text.slice(start, end);
    if (/[{}]/.test(picked)) {
      onNotice("La selección ya incluye una variable.", true);
      return onClear();
    }
    onPick({ p: para.i, start, end, text: picked, x, y });
  };

  return (
    <div className="relative" onMouseUp={onMouseUp}>
      {/* docx-preview pinta un lienzo gris oscuro: se deja con el fondo de la app y las páginas con nuestra sombra */}
      <style>{`.docx-view .docx-wrapper{background:var(--band)!important;padding:24px 16px!important}.docx-view .docx-wrapper>section.docx{box-shadow:var(--shadow-panel)!important;margin-bottom:24px!important}.docx-view ::selection{background:rgba(var(--brand-rgb),0.28)}`}</style>
      <div ref={styleRef} />
      {status === "loading" && (
        <div className="absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 pt-10">
          <span className="rounded-full bg-surface px-3 py-1 text-[12px] text-muted shadow-[var(--shadow-panel)]">Dibujando el Word…</span>
          {slow && (
            <button type="button" className="btn-outline btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              Está tardando · Reintentar
            </button>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-[13px] text-danger">
          <span>No se pudo dibujar el Word: {error}</span>
          <button type="button" className="btn-outline btn-sm" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}
      <div ref={bodyRef} data-status={status} className={`docx-view ${status === "ready" ? "" : "min-h-[320px] opacity-40"}`} />
    </div>
  );
}

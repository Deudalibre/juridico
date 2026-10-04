"use client";

import { useEffect, useState } from "react";

export type IndexItem = { id: string; label: string; estado?: "ok" | "warn" | "" ; detalle?: string };

/**
 * Índice fijo del expediente: una entrada por bloque, con un punto de estado y lo esencial (p. ej. «3 bienes»).
 * Al hacer clic desplaza al bloque; al desplazar, marca el bloque visible. Todo el expediente es una sola página.
 */
export function ExpedienteIndex({ items }: { items: IndexItem[] }) {
  const [activo, setActivo] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const root = document.querySelector(".content");
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visibles = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActivo(visibles[0].target.id);
      },
      { root, rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [items]);

  const ir = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    setActivo(id);
  };

  return (
    <nav className="sticky top-2 flex flex-col gap-0.5" aria-label="Bloques del expediente">
      {items.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => ir(i.id)}
          aria-current={activo === i.id ? "true" : undefined}
          className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${activo === i.id ? "font-semibold text-accent" : "text-soft hover:bg-surface-2 hover:text-fg"}`}
          style={activo === i.id ? { background: "var(--surface-active)" } : undefined}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: i.estado === "ok" ? "var(--success)" : i.estado === "warn" ? "var(--warning)" : "var(--border-strong)" }} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{i.label}</span>
          {i.detalle && <span className="tabnum shrink-0 text-[11px] text-muted">{i.detalle}</span>}
        </button>
      ))}
    </nav>
  );
}

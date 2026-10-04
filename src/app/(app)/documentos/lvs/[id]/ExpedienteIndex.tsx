"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

export type IndexEstado = "ok" | "warn" | "";
export type IndexItem = { id: string; label: string; estado?: IndexEstado; detalle?: string };
export type IndexGroup = { title: string; items: IndexItem[] };
export type ResumenItem = { label: string; value: string; tone?: IndexEstado; pct?: number };

/**
 * Lateral del expediente, con la misma lógica que el panel de filtros del CRM: grupos con título, una fila por
 * bloque con su casilla de estado (lista ✓, falta algo en ámbar, sin novedad vacía) y la cifra a la derecha.
 * Al hacer clic salta al bloque; al desplazar, marca el bloque visible. Debajo, el resumen del expediente.
 */
export function ExpedienteIndex({ groups, resumen }: { groups: IndexGroup[]; resumen: ResumenItem[] }) {
  const ids = groups.flatMap((g) => g.items.map((i) => i.id));
  const [activo, setActivo] = useState(ids[0] ?? "");
  const clave = ids.join("|");
  useEffect(() => {
    const root = document.querySelector(".content");
    const targets = clave
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visibles = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visibles[0]) setActivo(visibles[0].target.id);
      },
      { root, rootMargin: "-72px 0px -60% 0px", threshold: 0 },
    );
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [clave]);

  const ir = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    setActivo(id);
  };

  return (
    <div className="sticky top-0 flex flex-col gap-4 p-3">
      {groups.map((g) => (
        <nav key={g.title} className="flex flex-col gap-0.5" aria-label={g.title}>
          <span className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">{g.title}</span>
          {g.items.map((i) => (
            <button key={i.id} type="button" onClick={() => ir(i.id)} className="filter-opt w-full text-left" aria-current={activo === i.id ? "true" : undefined}>
              <Casilla estado={i.estado} />
              <span className="min-w-0 flex-1 truncate">{i.label}</span>
              {i.detalle && <span className="tabnum text-[11.5px] text-faint">{i.detalle}</span>}
            </button>
          ))}
        </nav>
      ))}

      <section className="flex flex-col rounded-lg border border-line-soft pb-1.5" style={{ background: "var(--band)" }} aria-label="Resumen del expediente">
        <span className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Resumen</span>
        {resumen.map((r) => (
          <div key={r.label} className="flex flex-col gap-1 px-3 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="text-muted">{r.label}</span>
              <span className="flex items-center gap-1.5 font-medium text-fg">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.tone === "ok" ? "var(--success)" : r.tone === "warn" ? "var(--warning)" : "var(--border-strong)" }} aria-hidden />
                <span className="tabnum">{r.value}</span>
              </span>
            </div>
            {r.pct != null && (
              <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--border-soft)" }} aria-hidden>
                <span className="block h-full rounded-full" style={{ width: `${r.pct}%`, background: r.pct === 100 ? "var(--success)" : "var(--brand-primary)" }} />
              </div>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

/** Casilla de estado del bloque: ✓ listo, ámbar falta algo, vacía sin novedad (mismo dibujo que los filtros del CRM). */
function Casilla({ estado }: { estado?: IndexEstado }) {
  const style = estado === "ok" ? { background: "var(--brand-dark)", borderColor: "var(--brand-dark)", color: "#fff" } : estado === "warn" ? { background: "var(--warning-bg)", borderColor: "var(--warning)" } : undefined;
  return (
    <span className="dot" style={style} aria-hidden>
      {estado === "ok" && <Icon name="check" size={10} />}
      {estado === "warn" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warning)" }} />}
    </span>
  );
}

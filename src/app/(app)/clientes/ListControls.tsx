"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { PROCEDURES, stepsFor, COMPLETED, IN_PREPARATION, SEMAFORO, SEMAFORO_KEYS } from "@/lib/legal";

export type ClientFilters = { proc?: string; abogado?: string; paso?: string; color?: string; desde?: string; hasta?: string };

/** Botón «Filtros» con panel desplegable, como en la lista de leads del CRM. */
export function FilterMenu({
  values,
  count,
  closed,
  keep,
  clearHref,
  lawyers,
}: {
  values: ClientFilters;
  count: number;
  closed: boolean;
  keep: Record<string, string>;
  clearHref: string;
  lawyers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);
  const steps = Array.from(new Set([IN_PREPARATION, ...PROCEDURES.flatMap((p) => [...stepsFor(p)]), COMPLETED]));

  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`btn-secondary btn-sm ${count ? "!border-brand-line !bg-surface-active !text-accent" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="funnel" size={15} />
        Filtros
        {count > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold leading-[18px] text-fg">{count}</span>}
      </button>
      {open && (
        <form action="/clientes" className="popover fade-in !left-0 !right-auto !w-[320px] p-4 max-[560px]:!fixed max-[560px]:!left-3 max-[560px]:!right-3 max-[560px]:!top-28 max-[560px]:!w-auto" onSubmit={() => setOpen(false)}>
          {Object.entries(keep).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div className="flex flex-col gap-3">
            <label className="field">
              <span className="label">Procedimiento</span>
              <select name="proc" defaultValue={values.proc ?? ""} className="input">
                <option value="">Todos</option>
                {PROCEDURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Abogado a cargo</span>
              <select name="abogado" defaultValue={values.abogado ?? ""} className="input">
                <option value="">Todos</option>
                <option value="sin">Sin abogado</option>
                {lawyers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            {!closed && (
              <label className="field">
                <span className="label">Color de la causa</span>
                <select name="color" defaultValue={values.color ?? ""} className="input">
                  <option value="">Todos</option>
                  {SEMAFORO_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {SEMAFORO[k].label} ({SEMAFORO[k].color})
                    </option>
                  ))}
                  <option value="sin">Sin color</option>
                </select>
              </label>
            )}
            {!closed && (
              <label className="field">
                <span className="label">Paso actual</span>
                <select name="paso" defaultValue={values.paso ?? ""} className="input">
                  <option value="">Todos</option>
                  {steps.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="field">
                <span className="label">Ingreso desde</span>
                <input type="date" name="desde" defaultValue={values.desde ?? ""} className="input" />
              </label>
              <label className="field">
                <span className="label">Ingreso hasta</span>
                <input type="date" name="hasta" defaultValue={values.hasta ?? ""} className="input" />
              </label>
            </div>
            <div className="flex justify-between gap-2 border-t border-line pt-3">
              <Link href={clearHref} className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Limpiar filtros
              </Link>
              <button type="submit" className="btn-primary btn-sm">
                Aplicar
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

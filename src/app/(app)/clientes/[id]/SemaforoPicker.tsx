"use client";

import { useRouter } from "next/navigation";
import { useTransition, type CSSProperties } from "react";
import { setSemaforo } from "../actions";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { SEMAFORO, SEMAFORO_KEYS } from "@/lib/legal";

/** Variables CSS del color elegido (definidas en globals.css como --sem-<clave> y --sem-<clave>-bg). */
export const semaforoStyle = (key: string | null): CSSProperties | undefined =>
  key && key in SEMAFORO ? ({ "--sem-color": `var(--sem-${key})`, "--sem-bg": `var(--sem-${key}-bg)` } as CSSProperties) : undefined;

/** Punto de color de la causa (para filas y cabeceras donde no cabe la etiqueta). */
export function SemaforoDot({ value, size }: { value: string | null; size?: "lg" }) {
  const s = value ? SEMAFORO[value] : null;
  return <span className={`sem-dot ${size ?? ""}`} style={semaforoStyle(value)} title={s ? `${s.label} · ${s.hint}` : "Sin color"} aria-label={s ? s.label : "Sin color"} />;
}

type Props = {
  clientId: string;
  value: string | null;
  canEdit: boolean;
  /** En tablas: solo el punto y la etiqueta corta */
  compact?: boolean;
};

/**
 * Semáforo de la causa: el color con que el estudio marca cada causa (verde al día, amarillo apercibimiento, rojo
 * rechazada…). Un clic abre el menú con los seis colores; quien no puede editar ve solo la etiqueta.
 */
export function SemaforoPicker({ clientId, value, canEdit, compact }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = value && value in SEMAFORO ? SEMAFORO[value] : null;

  const choose = (key: string | null) => {
    if ((key ?? null) === (value ?? null)) return;
    start(async () => {
      const r = await setSemaforo(clientId, key);
      if (r.error) toast(r.error, true);
      else {
        toast(key ? `${SEMAFORO[key].label} · ${SEMAFORO[key].hint}` : "Causa sin color");
        router.refresh();
      }
    });
  };

  const label = (
    <>
      <span className="sem-dot" style={semaforoStyle(value)} aria-hidden />
      <span className="sem-label">{current ? current.label : compact ? "Color…" : "Sin color"}</span>
    </>
  );

  if (!canEdit)
    return (
      <span className={`sem-trigger ${current ? "" : "muted"}`} style={semaforoStyle(value)} title={current?.hint} aria-disabled>
        {label}
      </span>
    );

  return (
    <Menu
      align="start"
      className="!w-[280px]"
      trigger={
        <button type="button" className={`sem-trigger ${current ? "" : "muted"}`} style={semaforoStyle(value)} disabled={pending} title={current ? `${current.label} · ${current.hint}` : "Marcar el color de la causa"} aria-label="Color de la causa" onClick={(e) => e.stopPropagation()}>
          {label}
          {!compact && <Icon name="chevron" size={12} />}
        </button>
      }
    >
      <MenuLabel>Color de la causa</MenuLabel>
      {SEMAFORO_KEYS.map((k) => (
        <MenuItem key={k} onSelect={() => choose(k)}>
          <span className="sem-dot lg" style={semaforoStyle(k)} aria-hidden />
          <span className="flex min-w-0 flex-col">
            <span>{SEMAFORO[k].label}</span>
            <span className="sem-item-hint">{SEMAFORO[k].hint}</span>
          </span>
          {k === value && <Icon name="check" size={13} />}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={() => choose(null)}>
        <span className="sem-dot lg" aria-hidden />
        <span>Sin color</span>
      </MenuItem>
    </Menu>
  );
}

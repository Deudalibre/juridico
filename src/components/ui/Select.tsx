"use client";

import * as RS from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

type SelectOption = { key: string; label: string; disabled?: boolean };

// Radix no admite "" como valor de un ítem: se usa un centinela para la opción «todos / ninguno».
const NONE = "__none__";
const toRadix = (v: string) => (v === "" ? NONE : v);
const fromRadix = (v: string) => (v === NONE ? "" : v);

type Props = {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  /** Texto fijo antes del valor («Vista:», «Ejecutivo:») */
  prefix?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  /** Nombre del campo cuando el selector va dentro de un formulario */
  name?: string;
};

/**
 * Desplegable con aspecto propio (Radix Select): mismo estilo en todos los navegadores,
 * teclado y lector de pantalla correctos. Incluye un <select> nativo oculto con todas las
 * opciones para que el HTML del servidor las contenga (formularios sin JS y pruebas).
 */
export function Select({ value, options, onChange, ariaLabel, prefix, size = "md", disabled, className = "", name }: Props) {
  const current = options.find((o) => o.key === value) ?? options[0];
  return (
    <>
      <select className="sr-only" aria-hidden tabIndex={-1} name={name} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <RS.Root value={toRadix(value)} onValueChange={(v) => onChange(fromRadix(v))} disabled={disabled}>
        <RS.Trigger className={`sel-trigger ${size === "sm" ? "sel-sm" : ""} ${className}`} aria-label={ariaLabel} onClick={(e) => e.stopPropagation()}>
          {prefix && <span className="sel-prefix">{prefix}</span>}
          <span className="sel-value">
            <RS.Value>{current?.label}</RS.Value>
          </span>
          <RS.Icon className="sel-chevron">
            <ChevronDown size={14} strokeWidth={1.8} aria-hidden />
          </RS.Icon>
        </RS.Trigger>
        <RS.Portal>
          <RS.Content className="sel-content" position="popper" sideOffset={4} align="start" onClick={(e) => e.stopPropagation()}>
            <RS.Viewport className="sel-viewport">
              {options.map((o) => (
                <RS.Item key={o.key} value={toRadix(o.key)} disabled={o.disabled} className="sel-item">
                  <RS.ItemText>{o.label}</RS.ItemText>
                  <RS.ItemIndicator className="sel-check">
                    <Check size={14} strokeWidth={2} aria-hidden />
                  </RS.ItemIndicator>
                </RS.Item>
              ))}
            </RS.Viewport>
          </RS.Content>
        </RS.Portal>
      </RS.Root>
    </>
  );
}

"use client";

import { useFormStatus } from "react-dom";
import { useState, useTransition, type ReactNode } from "react";
import { Icon } from "./icons";

export function SubmitButton({ children, pendingText, className = "btn-primary" }: { children: ReactNode; pendingText?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText ?? "Guardando…" : children}
    </button>
  );
}

export function Field({ label, error, children, className = "" }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label className="label">{label}</label>
      {children}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="relative h-[22px] w-10 shrink-0 cursor-pointer rounded-full border-0 transition-colors"
      style={{ background: on ? "var(--brand-primary)" : "var(--border-strong)" }}
    >
      <span className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-[left]" style={{ left: on ? 21 : 3 }} />
    </button>
  );
}

export function FormMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="alert-error" role="alert">
      {message}
    </div>
  );
}

/** Barra blanca de encabezado de pantalla: título a la izquierda, acciones a la derecha. */
export function PageTitle({ title, subtitle, icon, children }: { title: string; subtitle?: ReactNode; icon?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="icon-tile solid">
            <Icon name={icon} size={18} />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="page-title">{title}</h1>
          {subtitle && <span className="page-subtitle">{subtitle}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

export const Missing = ({ text = "No informado" }: { text?: string }) => <span className="text-[13.5px] text-faint">{text}</span>;

/** Lanza un toast desde cualquier componente cliente (lo pinta <Toaster />). */
export function toast(message: string, error = false) {
  window.dispatchEvent(new CustomEvent("crm:toast", { detail: { message, error } }));
}

/** Botón de borrar con confirmación en dos pasos; `action` es una server action. */
export function DeleteButton({ action, label = "Eliminar", confirmText = "¿Seguro? Confirmar" }: { action: () => Promise<void>; label?: string; confirmText?: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn-danger"
      disabled={pending}
      onBlur={() => setArmed(false)}
      onClick={() => (armed ? start(() => action()) : setArmed(true))}
    >
      {pending ? "Eliminando…" : armed ? confirmText : label}
    </button>
  );
}

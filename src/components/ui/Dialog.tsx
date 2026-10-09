"use client";

import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

/**
 * Capas modales sobre Radix Dialog: foco atrapado, Escape, clic fuera, aria-modal y
 * bloqueo del fondo resueltos por la biblioteca. Los eventos no salen del diálogo
 * (los portales de React propagan clics a la fila o tarjeta desde la que se abrió).
 */
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Diálogo centrado (confirmaciones, cierres, formularios cortos). */
export function Modal({
  title,
  subtitle,
  onClose,
  busy,
  wide,
  size,
  children,
  hideTitle,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  /** Formularios anchos (tablas de los anexos): 820 px */
  size?: "lg" | "xl";
  children: ReactNode;
  /** El contenido ya muestra su propio encabezado: el título queda solo para lectores de pantalla */
  hideTitle?: boolean;
}) {
  return (
    <D.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <D.Portal>
        <div onClick={stop} onPointerDown={stop}>
          <D.Overlay className="modal-backdrop fade-in" />
          <D.Content className={`card modal animate-in ${size === "xl" ? "!max-w-[1380px] !w-[94vw]" : size === "lg" ? "!max-w-[820px]" : wide ? "!max-w-[560px]" : "!max-w-[460px]"}`} aria-describedby={undefined}>
            <div className={hideTitle ? "sr-only" : "flex flex-col gap-1"}>
              <D.Title className="card-title">{title}</D.Title>
              {subtitle && <D.Description className="text-[13px] text-muted">{subtitle}</D.Description>}
            </div>
            {children}
          </D.Content>
        </div>
      </D.Portal>
    </D.Root>
  );
}

/** Marco del panel lateral derecho; el contenido (cabecera, cuerpo y pie) lo pone quien lo usa. */
export function DrawerFrame({ label, onClose, busy, children }: { label: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  return (
    <D.Root open onOpenChange={(o) => !o && !busy && onClose()}>
      <D.Portal>
        <div onClick={stop} onPointerDown={stop}>
          <D.Overlay className="drawer-backdrop" />
          <D.Content className="drawer" aria-describedby={undefined}>
            <D.Title className="sr-only">{label}</D.Title>
            {children}
          </D.Content>
        </div>
      </D.Portal>
    </D.Root>
  );
}

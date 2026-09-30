"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

/** Menú desplegable (Radix DropdownMenu) con el estilo del sistema: para el usuario, acciones «⋮», etc. */
export function Menu({ trigger, children, align = "end", className = "" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; className?: string }) {
  return (
    <DM.Root modal={false}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content className={`menu-content ${className}`} align={align} sideOffset={6} onClick={(e) => e.stopPropagation()}>
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function MenuItem({ children, onSelect, asChild, danger }: { children: ReactNode; onSelect?: () => void; asChild?: boolean; danger?: boolean }) {
  return (
    <DM.Item className={`menu-item ${danger ? "menu-item-danger" : ""}`} onSelect={onSelect} asChild={asChild}>
      {children}
    </DM.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="menu-label">{children}</DM.Label>;
}

export function MenuSeparator() {
  return <DM.Separator className="menu-sep" />;
}

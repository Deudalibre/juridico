import type { ReactNode } from "react";

/**
 * Ayuda desplegable sin JavaScript: un <details> con el contenido en un popover.
 * Se abre con clic y con teclado (Enter/Espacio sobre el botón) y no ocupa espacio cerrada.
 */
export function HelpPop({ label, title, children, align = "right" }: { label: string; title?: string; children: ReactNode; align?: "left" | "right" }) {
  return (
    <details className="relative inline-block">
      <summary
        className="flex min-h-[28px] cursor-pointer list-none items-center gap-1.5 rounded-full px-2 text-[12.5px] font-medium text-muted hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
        aria-label={title ?? label}
      >
        <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-line text-[11px] font-semibold" aria-hidden>
          ?
        </span>
        {label}
      </summary>
      <div className={`popover fade-in z-20 flex flex-col gap-2 p-4 text-[12.5px] leading-relaxed text-soft ${align === "left" ? "!left-0 !right-auto" : ""}`}>
        {title && <span className="text-[13px] font-semibold text-fg">{title}</span>}
        {children}
      </div>
    </details>
  );
}

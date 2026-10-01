"use client";

import { useLinkStatus } from "next/link";

/**
 * Punto que late mientras el enlace que lo contiene está cargando la siguiente pantalla
 * (Next 16: `useLinkStatus` dentro de un `<Link>`). Así la barra y el submenú responden al clic
 * aunque el servidor tarde en responder. No ocupa espacio cuando no hay carga.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="link-pending" aria-hidden /> : null;
}

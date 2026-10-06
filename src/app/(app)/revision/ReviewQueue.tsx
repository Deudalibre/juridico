"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type Queue = {
  /** Causa cuyo diálogo «Revisar» está abierto (una sola a la vez). */
  openId: string | null;
  open: (id: string | null) => void;
  /** Siguiente causa pendiente después de esta, en el orden de la cola; null si es la última. */
  nextAfter: (id: string) => string | null;
};

const Ctx = createContext<Queue | null>(null);

/**
 * Cola de revisión encadenada: al guardar una revisión con «Guardar y siguiente» se abre directamente la causa que
 * sigue, sin volver a la lista (como las colas de trabajo profesionales). El orden es el de la lista «Por revisar»
 * (antes las de tareas vencidas), que la página calcula en el servidor.
 */
export function ReviewQueueProvider({ order, children }: { order: string[]; children: ReactNode }) {
  const [openId, open] = useState<string | null>(null);
  const nextAfter = (id: string) => {
    const i = order.indexOf(id);
    return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
  };
  return <Ctx.Provider value={{ openId, open, nextAfter }}>{children}</Ctx.Provider>;
}

export const useReviewQueue = () => useContext(Ctx);

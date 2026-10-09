"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { pjudCooldown } from "@/lib/pjud-data";
import { sincronizarPjud } from "../actions";

const horaCl = (iso: string) => new Date(iso).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" });
/** «22 min», «1 h», «5 h 38 min»: lo que lleva o lo que falta, sin redondear 22 minutos a «1 h». */
const duracion = (ms: number) => {
  const min = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/**
 * «Sincronizar ahora»: consulta el PJUD desde el servidor de la app (en el estudio funciona; Vercel está bloqueado).
 * Anti-spam: una causa no se sincroniza a mano más de una vez cada 6 horas. Con `syncedAt` reciente el botón queda
 * deshabilitado y dice cuánto falta; si el servidor igual responde cooldown (carrera entre dos operadores), avisa con
 * la hora en que vuelve a estar disponible. Mientras la petición está en vuelo también va deshabilitado (sin doble clic).
 * `onDone` recarga los datos cuando el modal los pidió por su cuenta (lista de clientes); sin él basta router.refresh().
 */
export function SincronizarPjud({ clientId, syncedAt, onDone }: { clientId: string; syncedAt: string | null; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ahora] = useState(() => Date.now()); // fijado al abrir la ventana
  const espera = pjudCooldown(syncedAt, ahora);
  const nunca = !syncedAt;

  if (espera) {
    return (
      <button type="button" className="btn-ghost btn-sm" disabled title={`Para no saturar al Poder Judicial, cada causa se sincroniza a mano como máximo una vez cada 6 horas. Disponible a las ${horaCl(espera.next_available)}.`}>
        <Icon name="history" size={13} />
        {`Sincronizada hace ${duracion(ahora - Date.parse(syncedAt!))} — próxima en ${duracion(espera.restante_ms)}`}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={nunca ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await sincronizarPjud(clientId);
          if (r.error === "cooldown" && r.cooldown) toast(`Ya fue sincronizada recientemente. Próxima disponible: ${horaCl(r.cooldown.next_available)}`, true);
          else if (r.error) toast(r.error, true);
          else toast(`Sincronizado: ${r.actuaciones} actuaciones`);
          if (onDone) onDone();
          else router.refresh();
        })
      }
      title="Consultar ahora la Oficina Judicial Virtual"
    >
      <Icon name="history" size={13} />
      {pending ? "Consultando…" : "Sincronizar ahora"}
    </button>
  );
}

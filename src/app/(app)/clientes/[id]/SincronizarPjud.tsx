"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { sincronizarPjud } from "../actions";

/** «Sincronizar ahora»: consulta el PJUD desde el servidor de la app. En Vercel el PJUD lo rechaza; en el estudio funciona. */
export function SincronizarPjud({ clientId, nunca }: { clientId: string; nunca: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={nunca ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sincronizarPjud(clientId);
          if (r.error) toast(r.error, true);
          else {
            toast(`Sincronizado: ${r.actuaciones} actuaciones`);
            router.refresh();
          }
        })
      }
      title="Consultar ahora la Oficina Judicial Virtual"
    >
      <Icon name="history" size={13} />
      {pending ? "Consultando…" : "Sincronizar ahora"}
    </button>
  );
}

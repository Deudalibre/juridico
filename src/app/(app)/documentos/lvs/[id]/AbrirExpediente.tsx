"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { createLvs } from "../actions";

/** Cliente sin expediente LVS: un botón lo abre (sin pasar por «Nueva solicitud»). */
export function AbrirExpediente({ clientId, canCreate }: { clientId: string; canCreate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      const r = await createLvs(clientId);
      if (r.error) toast(r.error, true);
      else {
        toast("Expediente LVS abierto");
        router.replace(`/documentos/lvs/${clientId}?tab=Ficha%20maestra`);
      }
    });
  return (
    <section className="panel empty">
      <span className="icon-tile">
        <Icon name="report" />
      </span>
      <span className="empty-title">Este cliente aún no tiene expediente LVS</span>
      <span className="empty-text">Al abrirlo se crea la Ficha Maestra; nombre, RUT, teléfono y correo se toman de la causa.</span>
      {canCreate && (
        <button className="btn-primary" disabled={pending} onClick={open}>
          {pending ? "Abriendo…" : "Abrir expediente LVS"}
        </button>
      )}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { Modal } from "@/components/ui/Dialog";
import { deleteLvs } from "./actions";

type Props = { clientId: string; name: string; generados: number };

/**
 * Papelera de la fila en Solicitudes LVS: borra la solicitud (ficha, bienes, deudas y documentos generados) tras
 * confirmar. La causa sigue en Clientes y en el Drive no se borra nada.
 */
export function DeleteLvsButton({ clientId, name, generados }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const confirm = () =>
    start(async () => {
      const r = await deleteLvs(clientId);
      if (r.error) toast(r.error, true);
      else {
        toast(`Solicitud de ${name} eliminada. La causa sigue en Clientes.`);
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <>
      <button
        type="button"
        className="icon-btn text-danger"
        title="Eliminar la solicitud LVS (la causa sigue en Clientes)"
        aria-label={`Eliminar la solicitud LVS de ${name}`}
        onClick={(e) => {
          stop(e);
          setOpen(true);
        }}
        onPointerDown={stop}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Icon name="trash" size={14} />
      </button>
      {open && (
        <Modal title="Eliminar la solicitud LVS" subtitle={name} onClose={() => setOpen(false)} busy={pending}>
          <p className="text-[13px] text-soft">
            Se borran la ficha maestra, los bienes, los juicios, las deudas y {generados === 1 ? "el documento generado" : `los ${generados} documentos generados`} del almacén de la app.
            La causa sigue en Clientes con sus pasos, tareas e historial, y los archivos que ya están en el Drive no se tocan.
          </p>
          <p className="text-[12.5px] font-medium text-danger">Esto no se puede deshacer.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </button>
            <button type="button" className="btn-primary btn-sm !bg-danger" onClick={confirm} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar solicitud"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

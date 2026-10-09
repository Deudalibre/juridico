"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateTask } from "@/app/(app)/clientes/actions";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TASK_KINDS } from "@/lib/legal";
import { localInput } from "@/lib/format";
import type { LegalTask } from "@/lib/data";

type Props = {
  task: LegalTask;
  clientId: string;
  tz: string;
  /** «row»: el recuadro de edición ocupa todo el ancho de la fila (flex-wrap), como el de «Completar». */
  layout?: "inline" | "row";
};

/**
 * Editar una tarea pendiente en el sitio, sin abrir la ficha: tipo, título, plazo y detalle. Al guardar se refresca
 * la fila. Pedido por el estudio para la cola de Revisión.
 */
export function TaskEdit({ task, clientId, tz, layout = "inline" }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const save = (fd: FormData) =>
    start(async () => {
      const r = await updateTask(task.id, clientId, fd);
      if (r.error) toast(r.error, true);
      else {
        toast("Tarea actualizada");
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className={layout === "row" ? "contents" : "flex flex-wrap items-center gap-1.5"} onClick={stop}>
      {!open && (
        <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={(e) => (stop(e), setOpen(true))} title="Editar la tarea" aria-label={`Editar la tarea «${task.title}»`}>
          <Icon name="edit" size={13} />
        </button>
      )}
      {open && (
        <form action={save} className={`card flex flex-col gap-2 p-3 text-left ${layout === "row" ? "order-last basis-full" : "w-full"}`} onClick={stop} onKeyDown={stop} aria-label="Editar la tarea">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-fg">Editar «{task.title}»</span>
            <span className="text-[11.5px] text-muted">Cambia el tipo, el título o el plazo; el historial conserva el original.</span>
          </div>
          <fieldset disabled={pending} className="flex flex-wrap items-center gap-2">
            <select name="kind" defaultValue={task.kind in TASK_KINDS ? task.kind : "otra"} className="input !min-h-[32px] w-44 text-[12.5px]" aria-label="Tipo de tarea">
              {Object.entries(TASK_KINDS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input name="title" defaultValue={task.title} required maxLength={200} className="input !min-h-[32px] min-w-[220px] flex-1 text-[12.5px]" placeholder="De qué se trata" aria-label="Título de la tarea" />
            <input name="due_at" type="datetime-local" defaultValue={task.due_at ? localInput(new Date(task.due_at), tz) : ""} className="input tabnum !min-h-[32px] w-52 text-[12.5px]" aria-label="Vencimiento" />
            <input name="description" defaultValue={task.description ?? ""} maxLength={500} className="input !min-h-[32px] min-w-[220px] flex-1 text-[12.5px]" placeholder="Detalle (opcional)" aria-label="Detalle" />
            <button className="btn-primary btn-sm">{pending ? "…" : "Guardar"}</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
              Volver
            </button>
          </fieldset>
        </form>
      )}
    </div>
  );
}

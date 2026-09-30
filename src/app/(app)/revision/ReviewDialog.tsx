"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Field, toast } from "@/components/ui";
import { REVIEW_EVERY_DAYS, REVIEW_INTERVALS, TASK_KINDS } from "@/lib/legal";
import type { LegalClient, LegalTask } from "@/lib/data";
import { reviewCase } from "./actions";

type Props = {
  client: LegalClient;
  pendingTask: LegalTask | null;
  lawyers: { id: string; name: string }[];
  defaultAssignee: string;
  canTasks: boolean;
  onClose: () => void;
};

/** Registrar la revisión de una causa: movimiento, nota, tarea pendiente y cuándo vuelve a tocar. */
export function ReviewDialog({ client, pendingTask, lawyers, defaultAssignee, canTasks, onClose }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [movement, setMovement] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [nextDays, setNextDays] = useState(String(REVIEW_EVERY_DAYS));
  const [withTask, setWithTask] = useState(false);
  const [task, setTask] = useState({ title: "", kind: "solicitar_documento", dueLocal: "", assigneeId: defaultAssignee });

  const save = () => {
    if (movement === null) return toast("Indica si la causa tuvo movimiento.", true);
    start(async () => {
      const r = await reviewCase(client.id, { hadMovement: movement, note, nextDays: Number(nextDays), task: withTask ? task : null });
      if (r.error) toast(r.error, true);
      else {
        toast(`Revisión registrada · ${client.full_name}`);
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <Modal title={`Revisar · ${client.full_name}`} subtitle={[client.procedure_type, client.rol, client.tribunal].filter(Boolean).join(" · ") || "Sin datos de la causa"} onClose={onClose} busy={pending} wide>
      <div className="flex flex-col gap-4">
        {pendingTask && (
          <div className="rounded-md border border-line bg-[color:var(--band)] px-3 py-2 text-[12.5px]">
            <span className="text-muted">Tarea pendiente: </span>
            <span className="font-medium text-fg">{pendingTask.title}</span>
            <span className="text-muted"> · {TASK_KINDS[pendingTask.kind] ?? pendingTask.kind}</span>
          </div>
        )}

        <Field label="¿La causa tuvo movimiento desde la última revisión?">
          <div className="seg" role="group" aria-label="Movimiento">
            <button type="button" aria-current={movement === true ? "true" : undefined} onClick={() => setMovement(true)}>
              Sí, hubo movimiento
            </button>
            <button type="button" aria-current={movement === false ? "true" : undefined} onClick={() => setMovement(false)}>
              Sin movimiento
            </button>
          </div>
        </Field>

        <Field label={movement ? "Qué pasó (resolución, lo que pidió el tribunal, gestión hecha)" : "Nota (opcional)"}>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder={movement ? "Ej.: el tribunal pidió acompañar certificado de deudas actualizado" : "Ej.: sin novedades en el portal del Poder Judicial"} autoFocus />
        </Field>

        {canTasks && (
          <div className="flex flex-col gap-3 rounded-md border border-line px-3 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
              <input type="checkbox" checked={withTask} onChange={(e) => setWithTask(e.target.checked)} />
              Dejar una tarea pendiente
            </label>
            {withTask && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Qué hay que hacer" className="sm:col-span-2">
                  <input className="input" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} maxLength={200} placeholder="Ej.: pedir al cliente las últimas liquidaciones de sueldo" />
                </Field>
                <Field label="Tipo">
                  <Select ariaLabel="Tipo de tarea" value={task.kind} options={Object.entries(TASK_KINDS).map(([key, label]) => ({ key, label }))} onChange={(kind) => setTask({ ...task, kind })} />
                </Field>
                <Field label="Responsable">
                  <Select ariaLabel="Responsable" value={task.assigneeId} options={lawyers.map((m) => ({ key: m.id, label: m.name }))} onChange={(assigneeId) => setTask({ ...task, assigneeId })} />
                </Field>
                <Field label="Vence" className="sm:col-span-2">
                  <input type="datetime-local" className="input" value={task.dueLocal} onChange={(e) => setTask({ ...task, dueLocal: e.target.value })} />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field label="Volver a revisar">
          <Select ariaLabel="Próxima revisión" value={nextDays} options={REVIEW_INTERVALS.map((i) => ({ key: String(i.days), label: i.label }))} onChange={setNextDays} />
        </Field>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" onClick={save} disabled={pending}>
            {pending ? "Guardando…" : "Guardar revisión"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

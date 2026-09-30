"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Field, toast } from "@/components/ui";
import { COMPLETED, REVIEW_EVERY_DAYS, REVIEW_INTERVALS, STEP_LIQUIDATOR, TASK_KINDS, stepsFor } from "@/lib/legal";
import { dayKey } from "@/lib/format";
import type { LegalClient, LegalTask } from "@/lib/data";
import { reviewCase } from "./actions";

type Props = {
  client: LegalClient;
  pendingTask: LegalTask | null;
  /** Pasos ya hechos de la causa (para ofrecer solo los que faltan). */
  doneSteps: string[];
  lawyers: { id: string; name: string }[];
  defaultAssignee: string;
  canTasks: boolean;
  tz: string;
  onClose: () => void;
};

/**
 * Registrar la revisión de una causa en un solo paso: movimiento, nota, el paso que avanzó, la tarea que quedó
 * resuelta, la que queda pendiente y cuándo vuelve a tocar. Evita revisar aquí y volver a marcar en «Causa».
 */
export function ReviewDialog({ client, pendingTask, doneSteps, lawyers, defaultAssignee, canTasks, tz, onClose }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [movement, setMovement] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [nextDays, setNextDays] = useState(String(REVIEW_EVERY_DAYS));
  const [withTask, setWithTask] = useState(false);
  const [task, setTask] = useState({ title: "", kind: "solicitar_documento", dueLocal: "", assigneeId: defaultAssignee });
  const [resolved, setResolved] = useState(false);

  // Avance de paso: se ofrecen los pasos que faltan, con el actual preseleccionado
  const remaining = stepsFor(client.procedure_type).filter((st) => !doneSteps.includes(st));
  const current = client.current_step && client.current_step !== COMPLETED ? client.current_step : remaining[0] ?? null;
  const [advanced, setAdvanced] = useState<boolean | null>(null);
  const [step, setStep] = useState({ name: current ?? "", date: dayKey(new Date(), tz), liquidator: client.liquidator_name ?? "" });
  const askStep = movement === true && remaining.length > 0;
  const withStep = askStep && advanced === true;

  const save = () => {
    if (movement === null) return toast("Indica si la causa tuvo movimiento.", true);
    if (askStep && advanced === null) return toast("Indica si la causa avanzó de paso.", true);
    if (withStep && !step.name) return toast("Elige el paso que quedó hecho.", true);
    if (resolved && note.trim().length < 3) return toast("Si la tarea quedó resuelta, anota el resultado en la nota.", true);
    start(async () => {
      const r = await reviewCase(client.id, {
        hadMovement: movement,
        note,
        nextDays: Number(nextDays),
        task: withTask ? task : null,
        step: withStep ? step : null,
        resolvedTaskId: resolved && pendingTask ? pendingTask.id : null,
      });
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
          <div className="flex flex-col gap-2 rounded-md border border-line bg-[color:var(--band)] px-3 py-2 text-[12.5px]">
            <span>
              <span className="text-muted">Tarea pendiente: </span>
              <span className="font-medium text-fg">{pendingTask.title}</span>
              <span className="text-muted"> · {TASK_KINDS[pendingTask.kind] ?? pendingTask.kind}</span>
            </span>
            {canTasks && (
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
                Esta tarea quedó resuelta
                <span className="text-[11.5px] font-normal text-muted">(la nota queda como resultado)</span>
              </label>
            )}
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

        {askStep && (
          <div className="flex flex-col gap-3 rounded-md border border-line px-3 py-3">
            <Field label={current ? `¿Avanzó de paso? Paso actual: ${current}` : "¿Avanzó de paso?"}>
              <div className="seg" role="group" aria-label="Avance de paso">
                <button type="button" aria-current={advanced === true ? "true" : undefined} onClick={() => setAdvanced(true)}>
                  Sí, completó un paso
                </button>
                <button type="button" aria-current={advanced === false ? "true" : undefined} onClick={() => setAdvanced(false)}>
                  No, sigue en el mismo
                </button>
              </div>
            </Field>
            {withStep && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Paso que quedó hecho" className="sm:col-span-2">
                  <Select ariaLabel="Paso" value={step.name} options={remaining.map((st) => ({ key: st, label: st }))} onChange={(name) => setStep({ ...step, name })} />
                </Field>
                <Field label="Fecha del paso">
                  <input type="date" className="input tabnum" value={step.date} onChange={(e) => setStep({ ...step, date: e.target.value })} />
                </Field>
                {step.name === STEP_LIQUIDATOR && (
                  <Field label="Liquidador titular">
                    <input className="input" value={step.liquidator} onChange={(e) => setStep({ ...step, liquidator: e.target.value })} placeholder="Nombre según el certificado" maxLength={200} />
                  </Field>
                )}
                <span className="text-[12px] text-muted sm:col-span-2">Lo que anotaste arriba queda como nota del paso. No hace falta volver a marcarlo en «Causa».</span>
              </div>
            )}
          </div>
        )}

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

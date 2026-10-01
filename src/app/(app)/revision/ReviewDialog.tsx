"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Modal } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { dateTime, dayKey, dueLabel } from "@/lib/format";
import { COMPLETED, STEP_LIQUIDATOR, TASK_KINDS, reviewCadence, stepsFor } from "@/lib/legal";
import type { LegalClient, LegalReview, LegalTask } from "@/lib/data";
import { reviewCase } from "./actions";

type Props = {
  client: LegalClient;
  pendingTask: LegalTask | null;
  lastReview: LegalReview | null;
  /** Pasos ya hechos de la causa (para ofrecer solo los que faltan). */
  doneSteps: string[];
  lawyers: { id: string; name: string }[];
  defaultAssignee: string;
  canTasks: boolean;
  tz: string;
  onClose: () => void;
};

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line-soft pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-active text-[11px] font-bold text-accent">{n}</span>
        <span className="text-[13.5px] font-semibold text-fg">{title}</span>
        {hint && <span className="text-[12px] text-muted">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Revisión de una causa en tres pasos, de arriba abajo: 1) qué encontraste (sin o con movimiento), 2) si hubo
 * movimiento, qué pasó y si avanzó de paso, 3) tareas (la pendiente que quedó resuelta y la que queda).
 * La próxima revisión no se elige: sale de la cadencia de la causa (3 días sin resolución, 7 después).
 */
export function ReviewDialog({ client, pendingTask, lastReview, doneSteps, lawyers, defaultAssignee, canTasks, tz, onClose }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [movement, setMovement] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [withTask, setWithTask] = useState(false);
  const [task, setTask] = useState({ title: "", kind: "solicitar_documento", dueLocal: "", assigneeId: defaultAssignee });
  const [resolved, setResolved] = useState(false);

  const remaining = stepsFor(client.procedure_type).filter((st) => !doneSteps.includes(st));
  const current = client.current_step && client.current_step !== COMPLETED ? client.current_step : remaining[0] ?? null;
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState({ name: current ?? "", date: dayKey(new Date(), tz), liquidator: client.liquidator_name ?? "" });
  const askStep = movement === true && remaining.length > 0;
  const withStep = askStep && advanced;
  const cadence = reviewCadence(client.procedure_type, withStep ? [...doneSteps, step.name] : doneSteps);

  const save = () => {
    if (movement === null) return toast("Indica si la causa tuvo movimiento.", true);
    if (movement && note.trim().length < 3) return toast("Anota qué pasó: es lo que queda en el historial.", true);
    if (withStep && !step.name) return toast("Elige el paso que quedó hecho.", true);
    if (resolved && note.trim().length < 3) return toast("Si la tarea quedó resuelta, anota el resultado en la nota.", true);
    start(async () => {
      const r = await reviewCase(client.id, {
        hadMovement: movement,
        note,
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

  const due = pendingTask?.due_at ? dueLabel(pendingTask.due_at, tz) : null;

  return (
    <Modal title={`Revisar · ${client.full_name}`} subtitle={[client.procedure_type, client.rol, client.tribunal].filter(Boolean).join(" · ") || "Sin datos de la causa"} onClose={onClose} busy={pending} wide>
      <div className="flex flex-col gap-4">
        {/* Contexto: dónde va la causa y cuándo se vio por última vez */}
        <div className="grid gap-x-4 gap-y-1 rounded-md bg-[color:var(--band)] px-3 py-2 text-[12.5px] sm:grid-cols-2">
          <span>
            <span className="text-muted">Paso actual: </span>
            <span className="font-medium text-fg">{current ?? (client.procedure_type ? "Todos completados" : "Sin procedimiento")}</span>
          </span>
          <span>
            <span className="text-muted">Última revisión: </span>
            {lastReview ? (
              <span className="font-medium text-fg">
                {dateTime(lastReview.reviewed_at, tz)} · {lastReview.reviewer_name ?? "—"} · {lastReview.had_movement ? "con movimiento" : "sin movimiento"}
              </span>
            ) : (
              <span className="font-medium text-warning">nunca</span>
            )}
          </span>
          {lastReview?.note && (
            <span className="truncate sm:col-span-2" title={lastReview.note}>
              <span className="text-muted">Nota anterior: </span>
              <span className="text-soft">{lastReview.note}</span>
            </span>
          )}
        </div>

        <Section n={1} title="¿Qué encontraste?">
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className={`option-card ${movement === false ? "selected" : ""}`} aria-pressed={movement === false} onClick={() => setMovement(false)}>
              <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Icon name="check" size={15} /> Sin movimiento
              </span>
              <span className="text-[12px] text-muted">Nada nuevo en el portal. Se registra y vuelve a la cola en {cadence.days} días.</span>
            </button>
            <button type="button" className={`option-card ${movement === true ? "selected" : ""}`} aria-pressed={movement === true} onClick={() => setMovement(true)}>
              <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Icon name="history" size={15} /> Con movimiento
              </span>
              <span className="text-[12px] text-muted">Salió una resolución, el tribunal pidió algo o se hizo una gestión.</span>
            </button>
          </div>
          {movement === false &&
            (showNote ? (
              <Field label="Nota (opcional)">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Ej.: sin novedades en el portal del Poder Judicial" autoFocus />
              </Field>
            ) : (
              <button type="button" className="link-muted self-start text-[12.5px]" onClick={() => setShowNote(true)}>
                + Agregar una nota
              </button>
            ))}
        </Section>

        {movement === true && (
          <Section n={2} title="Qué pasó" hint="Queda en el historial de la causa">
            <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Ej.: el tribunal pidió acompañar certificado de deudas actualizado" autoFocus />
            {askStep && (
              <div className="flex flex-col gap-3 rounded-md border border-line px-3 py-3">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                  <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                  La causa avanzó de paso
                  {current && <span className="text-[12px] font-normal text-muted">(está en «{current}»)</span>}
                </label>
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
                    <span className="text-[12px] text-muted sm:col-span-2">La nota de arriba queda como nota del paso. No hace falta volver a marcarlo en «Causa».</span>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {movement !== null && (pendingTask || canTasks) && (
          <Section n={movement ? 3 : 2} title="Tareas">
            {pendingTask && (
              <div className="flex flex-col gap-2 rounded-md border border-line px-3 py-2.5 text-[12.5px]">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tag">{TASK_KINDS[pendingTask.kind] ?? pendingTask.kind}</span>
                  <span className="font-medium text-fg">{pendingTask.title}</span>
                  {due && <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span>}
                </span>
                {canTasks && (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                    <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
                    Quedó resuelta
                    <span className="text-[11.5px] font-normal text-muted">(la nota queda como resultado)</span>
                  </label>
                )}
              </div>
            )}
            {canTasks && (
              <div className="flex flex-col gap-3 rounded-md border border-line px-3 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                  <input type="checkbox" checked={withTask} onChange={(e) => setWithTask(e.target.checked)} />
                  Dejar una tarea pendiente
                </label>
                {withTask && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Qué hay que hacer" className="sm:col-span-2">
                      <input className="input" value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} maxLength={200} placeholder="Ej.: pedir al cliente las últimas liquidaciones de sueldo" autoFocus />
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
          </Section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
          <span className="text-[12px] text-muted">
            Próxima revisión: en {cadence.days} días · {cadence.reason}
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={save} disabled={pending || movement === null}>
              {pending ? "Guardando…" : "Guardar revisión"}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

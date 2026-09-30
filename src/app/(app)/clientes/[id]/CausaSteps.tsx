"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTask, completeStep, finishTask, undoStep } from "../actions";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { dueLabel, localAt } from "@/lib/format";
import { COMPLETED, STEP_APERCIBIMIENTOS, STEP_LIQUIDATOR, STEP_RESOLUTION, TASK_KINDS } from "@/lib/legal";
import type { CaseStep, LegalTask } from "@/lib/data";

type Props = {
  clientId: string;
  procedure: string | null;
  steps: readonly string[];
  done: CaseStep[];
  current: string | null;
  tasks: LegalTask[];
  names: Record<string, string>;
  liquidatorName: string | null;
  canEdit: boolean;
  canTasks: boolean;
  closed: boolean;
  tz: string;
};

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);

/** Pestaña «Causa»: los pasos del procedimiento en orden y las tareas con fecha (apercibimientos, audiencias). */
export function CausaSteps({ clientId, procedure, steps, done, current, tasks, names, liquidatorName, canEdit, canTasks, closed, tz }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marking, setMarking] = useState<string | null>(null);
  const [newTask, setNewTask] = useState(false);
  const doneBy = new Map(done.map((d) => [d.step, d]));
  const editable = canEdit && !closed;

  const run = (fn: () => Promise<{ error?: string }>, okMsg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast(r.error, true);
      else {
        toast(okMsg);
        after?.();
        router.refresh();
      }
    });

  if (steps.length === 0)
    return (
      <section className="panel empty">
        <span className="empty-title">Define el procedimiento para ver sus pasos</span>
        <span className="empty-text">En «Antecedentes», elige Liquidación voluntaria o Renegociación.</span>
      </section>
    );

  const pendingTasks = tasks.filter((t) => t.status === "pendiente");
  const doneTasks = tasks.filter((t) => t.status !== "pendiente");

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="panel">
        <div className="panel-head">
          <span className="card-title">Pasos de la causa</span>
          <span className="text-[12.5px] text-muted">
            {procedure} · {done.length} de {steps.length} completados
          </span>
        </div>
        <ol className="flex flex-col">
          {steps.map((step, i) => {
            const d = doneBy.get(step);
            const isCurrent = step === current;
            const isMarking = marking === step;
            return (
              <li key={step} className={`flex flex-col gap-2 border-b border-line-soft px-5 py-3 last:border-b-0 ${isCurrent ? "bg-surface-active" : ""}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                      d ? "bg-[var(--success-bg)] text-success" : isCurrent ? "bg-accent text-white" : "bg-surface-2 text-muted"
                    }`}
                    aria-hidden
                  >
                    {d ? <Icon name="check" size={14} /> : i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-[13.5px] ${d || isCurrent ? "font-semibold text-fg" : "text-soft"}`}>
                      {step}
                      {step === STEP_RESOLUTION && <span className="tag brand ml-2">Hito</span>}
                    </span>
                    {d ? (
                      <span className="text-[12px] text-muted">
                        {fmtDate(d.completed_at)}
                        {d.completed_by && names[d.completed_by] ? ` · ${names[d.completed_by]}` : ""}
                        {step === STEP_LIQUIDATOR && liquidatorName ? ` · Liquidador: ${liquidatorName}` : ""}
                        {d.note ? ` · ${d.note}` : ""}
                      </span>
                    ) : isCurrent ? (
                      <span className="text-[12px] text-accent">Paso actual</span>
                    ) : null}
                  </div>
                  {editable && !isMarking && (
                    <div className="flex items-center gap-1.5">
                      {d ? (
                        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => undoStep(clientId, step), "Paso deshecho")}>
                          Deshacer
                        </button>
                      ) : (
                        <button className={isCurrent ? "btn-primary btn-sm" : "btn-outline btn-sm"} disabled={pending} onClick={() => setMarking(step)}>
                          Marcar hecho
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {isMarking && (
                  <form
                    action={(fd) => run(() => completeStep(clientId, fd), "Paso completado", () => setMarking(null))}
                    className="ml-10 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface p-3"
                  >
                    <input type="hidden" name="step" value={step} />
                    <Field label="Fecha" className="w-40">
                      <input name="completed_at" type="date" className="input tabnum" defaultValue={today()} required disabled={pending} />
                    </Field>
                    {step === STEP_LIQUIDATOR && (
                      <Field label="Liquidador titular" className="min-w-[220px] flex-1">
                        <input name="liquidator_name" className="input" defaultValue={liquidatorName ?? ""} placeholder="Nombre según el certificado" required disabled={pending} />
                      </Field>
                    )}
                    <Field label="Nota (opcional)" className="min-w-[200px] flex-1">
                      <input name="note" className="input" placeholder={step === STEP_APERCIBIMIENTOS ? "Los apercibimientos concretos van como tareas, a la derecha" : ""} disabled={pending} />
                    </Field>
                    <button className="btn-primary btn-sm" disabled={pending}>
                      {pending ? "Guardando…" : "Guardar"}
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setMarking(null)} disabled={pending}>
                      Cancelar
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
        {current === COMPLETED && (
          <div className="border-t border-line-soft px-5 py-3 text-[12.5px] text-success">Todos los pasos están completados. Si corresponde, cierra la causa desde la cabecera.</div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="card-title">Apercibimientos y tareas</span>
          {canTasks && !closed && (
            <button className="btn-outline btn-sm ml-auto" onClick={() => setNewTask((v) => !v)} aria-expanded={newTask}>
              + Nueva
            </button>
          )}
        </div>
        {newTask && (
          <form action={(fd) => run(() => addTask(clientId, fd), "Tarea creada", () => setNewTask(false))} className="flex flex-col gap-3 border-b border-line-soft px-4 py-3">
            <Field label="Tipo">
              <select name="kind" className="input" defaultValue="apercibimiento" disabled={pending}>
                {Object.entries(TASK_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="De qué se trata">
              <input name="title" className="input" placeholder="Acompañar certificado de deudas" required disabled={pending} />
            </Field>
            <Field label="Vence el">
              <input name="due_at" type="datetime-local" className="input tabnum" defaultValue={localAt(tz, 5, 10)} disabled={pending} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setNewTask(false)} disabled={pending}>
                Cancelar
              </button>
              <button className="btn-primary btn-sm" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
        )}
        {pendingTasks.length === 0 && doneTasks.length === 0 && !newTask && (
          <div className="px-4 py-6 text-center text-[12.5px] text-faint">Sin tareas. Cuando salga un apercibimiento, créalo aquí con su fecha de vencimiento.</div>
        )}
        {pendingTasks.map((t) => {
          const due = t.due_at ? dueLabel(t.due_at, tz) : null;
          return (
            <div key={t.id} className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag">{TASK_KINDS[t.kind] ?? t.kind}</span>
                <span className="text-[13.5px] font-medium">{t.title}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {due ? <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span> : <span className="tag warn">Sin fecha</span>}
                {canTasks && !closed && (
                  <>
                    <button className="btn-outline btn-sm" disabled={pending} onClick={() => run(() => finishTask(t.id, clientId, "completada"), "Tarea completada")}>
                      Completar
                    </button>
                    <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => finishTask(t.id, clientId, "cancelada"), "Tarea cancelada")}>
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {doneTasks.length > 0 && (
          <details className="border-t border-line-soft px-4 py-2 text-[12.5px] text-muted">
            <summary className="cursor-pointer">Terminadas ({doneTasks.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {doneTasks.map((t) => (
                <li key={t.id} className={t.status === "cancelada" ? "line-through" : ""}>
                  {TASK_KINDS[t.kind] ?? t.kind} · {t.title}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

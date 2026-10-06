"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTask, completeStep, undoStep } from "../actions";
import { documentUrl } from "../documents-actions";
import { TaskClose } from "@/components/TaskClose";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { dueLabel, localAt } from "@/lib/format";
import { COMPLETED, STEP_APERCIBIMIENTOS, STEP_DOCS, STEP_FILING, STEP_LIQUIDATOR, STEP_RESOLUTION, STEP_TERMINATION, TASK_KINDS } from "@/lib/legal";
import { uploadCaseFile } from "@/lib/upload-client";
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
  filing: { rol: string | null; tribunal: string | null; intakeDate: string | null };
  canEdit: boolean;
  canTasks: boolean;
  closed: boolean;
  tz: string;
  /** Mostrar el panel «Pasos de la causa». El estudio lo quitó de la ficha por ahora (2026-10-06): recargaba sin aportar. */
  showSteps?: boolean;
};

const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Pestaña «Causa»: los pasos del procedimiento en orden, cada uno con su comprobante cuando lo exige (certificado de
 * envío, certificado de nominación, resolución de término), y las tareas con fecha (apercibimientos, audiencias).
 */
export function CausaSteps({ clientId, procedure, steps, done, current, tasks, names, liquidatorName, filing, canEdit, canTasks, closed, tz, showSteps = true }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [marking, setMarking] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [newTask, setNewTask] = useState(false);
  const doneBy = new Map(done.map((d) => [d.step, d]));
  const editable = canEdit && !closed;

  const run = (fn: () => Promise<{ error?: string }>, okMsg: string, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.error) toast(r.error, true);
        else {
          toast(okMsg);
          after?.();
          router.refresh();
        }
      } catch (e) {
        toast((e as Error).message, true);
      }
    });

  /** Marcar el paso: si lleva comprobante, primero se sube al almacén y luego se registra todo junto. */
  const submitStep = (step: string, fd: FormData) => {
    const spec = STEP_DOCS[step];
    if (spec?.required && !file) return toast(`Adjunta el ${spec.label}: es lo que acredita este paso.`, true);
    run(
      async () => {
        if (file && spec) {
          const up = await uploadCaseFile(clientId, file);
          fd.set("doc_path", up.path);
          fd.set("doc_size", String(up.size));
          fd.set("doc_mime", up.mime);
          fd.set("doc_name", up.fileName);
        }
        return completeStep(clientId, fd);
      },
      step === STEP_TERMINATION ? "Resolución de término registrada: la causa queda cerrada como terminada" : "Paso completado",
      () => {
        setMarking(null);
        setFile(null);
      }
    );
  };

  const openDoc = (id: string) =>
    start(async () => {
      const r = await documentUrl(id);
      if (r.error || !r.url) toast(r.error ?? "Sin enlace", true);
      else window.open(r.url, "_blank", "noopener");
    });

  if (steps.length === 0 && showSteps)
    return (
      <section className="panel empty">
        <span className="empty-title">Define el procedimiento para ver sus pasos</span>
        <span className="empty-text">En «Antecedentes», elige Liquidación voluntaria o Renegociación.</span>
      </section>
    );

  const pendingTasks = tasks.filter((t) => t.status === "pendiente");
  const doneTasks = tasks.filter((t) => t.status !== "pendiente");

  return (
    <div className={showSteps ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]" : "grid gap-3"}>
      {showSteps && (
      <section className="panel">
        <div className="panel-head">
          <span className="card-title">Pasos de la causa</span>
          <span className="text-[12.5px] text-muted">
            {procedure} · {done.filter((d) => steps.includes(d.step)).length} de {steps.length} completados
          </span>
        </div>
        <ol className="flex flex-col">
          {steps.map((step, i) => {
            const d = doneBy.get(step);
            const isCurrent = step === current;
            const isMarking = marking === step;
            const spec = STEP_DOCS[step];
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
                    <span className={`flex flex-wrap items-center gap-2 text-[13.5px] ${d || isCurrent ? "font-semibold text-fg" : "text-soft"}`}>
                      {step}
                      {step === STEP_RESOLUTION && <span className="tag brand">Hito</span>}
                      {spec && !d && (
                        <span className={`tag ${spec.required ? "warn" : ""}`} title={spec.hint}>
                          <Icon name="bookmark" size={11} /> {spec.required ? "Requiere" : "Admite"} {spec.label.toLowerCase()}
                        </span>
                      )}
                      {step === STEP_TERMINATION && !d && <span className="tag">Cierra la causa</span>}
                    </span>
                    {d ? (
                      <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
                        <span>
                          {fmtDate(d.completed_at)}
                          {d.completed_by && names[d.completed_by] ? ` · ${names[d.completed_by]}` : ""}
                          {step === STEP_LIQUIDATOR && liquidatorName ? ` · Liquidador: ${liquidatorName}` : ""}
                          {d.note ? ` · ${d.note}` : ""}
                        </span>
                        {d.document_id && spec && (
                          <button type="button" className="link-muted inline-flex items-center gap-1 text-accent" disabled={pending} onClick={() => openDoc(d.document_id!)}>
                            <Icon name="eye" size={12} /> Ver {spec.label.toLowerCase()}
                          </button>
                        )}
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
                        <button
                          className={isCurrent ? "btn-primary btn-sm" : "btn-outline btn-sm"}
                          disabled={pending}
                          onClick={() => {
                            setFile(null);
                            setMarking(step);
                          }}
                        >
                          {spec?.required ? `Subir ${spec.label.toLowerCase()}` : "Marcar hecho"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {isMarking && (
                  <form action={(fd) => submitStep(step, fd)} className="card ml-10 flex flex-wrap items-end gap-2 p-3">
                    <input type="hidden" name="step" value={step} />
                    {spec && (
                      <Field label={`${spec.label}${spec.required ? "" : " (opcional)"}`} className="basis-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="input !py-1.5 text-[12.5px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12px]"
                            disabled={pending}
                            required={spec.required}
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                          />
                          <span className="text-[12px] text-muted">{spec.hint}</span>
                        </div>
                      </Field>
                    )}
                    {step === STEP_FILING && (
                      <>
                        <Field label="Rol de la causa" className="w-44">
                          <input name="rol" className="input tabnum" defaultValue={filing.rol ?? ""} placeholder="C-1234-2026" required disabled={pending} />
                        </Field>
                        <Field label="Tribunal" className="min-w-[220px] flex-1">
                          <input name="tribunal" className="input" defaultValue={filing.tribunal ?? ""} placeholder="1º Juzgado Civil de Santiago" required disabled={pending} />
                        </Field>
                        <Field label="Fecha de ingreso" className="w-40">
                          <input name="intake_date" type="date" className="input tabnum" defaultValue={filing.intakeDate ?? today()} required disabled={pending} />
                        </Field>
                      </>
                    )}
                    <Field label={step === STEP_FILING ? "Fecha del paso" : "Fecha"} className="w-40">
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
                      {pending ? "Guardando…" : step === STEP_TERMINATION ? "Guardar y cerrar la causa" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => {
                        setMarking(null);
                        setFile(null);
                      }}
                      disabled={pending}
                    >
                      Cancelar
                    </button>
                    <span className="basis-full text-[12px] text-muted">
                      {step === STEP_TERMINATION
                        ? "Con la resolución de término la causa pasa a «Cerradas» como causa terminada, con todo su historial."
                        : "Queda registrado también como revisión con movimiento: la causa no volverá a la cola de «Por revisar» por este avance."}
                    </span>
                  </form>
                )}
              </li>
            );
          })}
        </ol>
        {current === COMPLETED && !closed && (
          <div className="border-t border-line-soft px-5 py-3 text-[12.5px] text-success">Todos los pasos están completados. Si corresponde, cierra la causa desde la cabecera.</div>
        )}
      </section>
      )}

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
          <form action={(fd) => run(() => addTask(clientId, fd), "Tarea creada", () => setNewTask(false))} className="flex flex-col gap-2 border-b border-line-soft px-4 py-3">
            <Field label="Tipo">
              <select name="kind" className="input" defaultValue="apercibimiento" disabled={pending}>
                {Object.entries(TASK_KINDS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Qué hay que hacer">
              <input name="title" className="input" placeholder="Ej.: acompañar certificado de deudas actualizado" required disabled={pending} />
            </Field>
            <Field label="Vence">
              <input name="due_at" type="datetime-local" className="input" defaultValue={localAt(tz, 3, 10)} disabled={pending} />
            </Field>
            <Field label="Detalle (opcional)">
              <input name="description" className="input" disabled={pending} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setNewTask(false)} disabled={pending}>
                Cancelar
              </button>
              <button className="btn-primary btn-sm" disabled={pending}>
                Guardar
              </button>
            </div>
          </form>
        )}
        {pendingTasks.length === 0 && !newTask && <div className="px-4 py-6 text-center text-[12.5px] text-faint">Sin tareas pendientes. Los apercibimientos del tribunal se registran aquí con su fecha de vencimiento.</div>}
        {pendingTasks.map((t) => {
          const due = t.due_at ? dueLabel(t.due_at, tz) : null;
          return (
            <div key={t.id} className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tag">{TASK_KINDS[t.kind] ?? t.kind}</span>
                <span className="text-[13px] font-medium text-fg">{t.title}</span>
              </div>
              {t.description && <span className="text-[12px] text-muted">{t.description}</span>}
              <div className="flex flex-wrap items-center gap-2">
                {due ? <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span> : <span className="tag warn">Sin fecha</span>}
              </div>
              {canTasks && !closed && <TaskClose task={t} clientId={clientId} layout="inline" />}
            </div>
          );
        })}
        {doneTasks.length > 0 && (
          <details className="px-4 py-3 text-[12px] text-muted">
            <summary className="cursor-pointer">Terminadas ({doneTasks.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {doneTasks.map((t) => (
                <li key={t.id} className="flex flex-col">
                  <span className={t.status === "cancelada" ? "line-through" : ""}>
                    {TASK_KINDS[t.kind] ?? t.kind} · {t.title}
                  </span>
                  <span className="text-[11.5px] text-faint">
                    {t.status === "cancelada" ? "Cancelada" : "Completada"}
                    {t.closed_by && names[t.closed_by] ? ` por ${names[t.closed_by]}` : ""}
                    {t.completed_at || t.canceled_at ? ` · ${dueLabel(t.completed_at ?? t.canceled_at!, tz).text}` : ""}
                    {t.result ? ` · ${t.result}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

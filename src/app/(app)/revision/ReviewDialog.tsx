"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { dateTime, dayKey, dueLabel } from "@/lib/format";
import { COMPLETED, SEMAFORO, SEMAFORO_KEYS, STEP_DOCS, STEP_FILING, STEP_LIQUIDATOR, STEP_TERMINATION, TASK_KINDS, reviewCadence, semaforoStyle, stepsFor } from "@/lib/legal";
import { uploadCaseFile } from "@/lib/upload-client";
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
  /** Hay otra causa pendiente después de esta en la cola (habilita «Guardar y siguiente»). */
  hasNext?: boolean;
  onClose: () => void;
  /** Tras guardar: true = abrir la siguiente causa de la cola; false = cerrar. Si no viene, se cierra. */
  onSaved?: (goNext: boolean) => void;
};

/** Tecla → color de la causa (la letra va marcada en cada ficha de color). */
const COLOR_KEYS: Record<string, string | null> = { a: "ok", p: "apercibimiento", r: "rechazada", i: "reingresada", n: "nominar", z: "pyp_zoom", "0": null };
const KEY_OF: Record<string, string> = Object.fromEntries(Object.entries(COLOR_KEYS).filter(([, v]) => v).map(([k, v]) => [v as string, k.toUpperCase()]));

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
 * Revisión de una causa en tres pasos, de arriba abajo: 1) qué encontraste (sin o con movimiento) y el color con que
 * queda la causa (semáforo; antes era un selector aparte en la fila y el estudio lo sintió como doble trabajo),
 * 2) si hubo movimiento, qué pasó y si avanzó de paso, 3) tareas (la pendiente que quedó resuelta y la que queda).
 * La próxima revisión no se elige: sale de la cadencia de la causa (3 días sin resolución, 7 después).
 */
export function ReviewDialog({ client, pendingTask, lastReview, doneSteps, lawyers, defaultAssignee, canTasks, tz, hasNext, onClose, onSaved }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [movement, setMovement] = useState<boolean | null>(null);
  const [color, setColor] = useState<string | null>(client.semaforo && client.semaforo in SEMAFORO ? client.semaforo : null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [withTask, setWithTask] = useState(false);
  const [task, setTask] = useState({ title: "", kind: "solicitar_documento", dueLocal: "", assigneeId: defaultAssignee });
  const [resolved, setResolved] = useState(false);

  const remaining = stepsFor(client.procedure_type).filter((st) => !doneSteps.includes(st));
  const current = client.current_step && client.current_step !== COMPLETED ? client.current_step : remaining[0] ?? null;
  const [advanced, setAdvanced] = useState(false);
  const [step, setStep] = useState({ name: current ?? "", date: dayKey(new Date(), tz), liquidator: client.liquidator_name ?? "" });
  const [stepFile, setStepFile] = useState<File | null>(null);
  const [filing, setFiling] = useState({ rol: client.rol ?? "", tribunal: client.tribunal ?? "", intakeDate: client.intake_date ?? dayKey(new Date(), tz) });
  const askStep = movement === true && remaining.length > 0;
  const withStep = askStep && advanced;
  const stepSpec = withStep ? STEP_DOCS[step.name] : undefined;
  const cadence = reviewCadence(client.procedure_type, withStep ? [...doneSteps, step.name] : doneSteps);

  const save = (goNext = false) => {
    if (movement === null) return toast("Indica si la causa tuvo movimiento.", true);
    if (movement && note.trim().length < 3) return toast("Anota qué pasó: es lo que queda en el historial.", true);
    if (withStep && !step.name) return toast("Elige el paso que quedó hecho.", true);
    if (stepSpec?.required && !stepFile) return toast(`Adjunta el ${stepSpec.label}: es lo que acredita este paso.`, true);
    if (withStep && step.name === STEP_FILING && (!filing.rol.trim() || !filing.tribunal.trim())) return toast("Con el certificado de envío van el rol y el tribunal de la causa.", true);
    if (resolved && note.trim().length < 3) return toast("Si la tarea quedó resuelta, anota el resultado en la nota.", true);
    start(async () => {
      try {
        const document = withStep && stepFile ? await uploadCaseFile(client.id, stepFile) : null;
        const r = await reviewCase(client.id, {
          hadMovement: movement,
          note,
          task: withTask ? task : null,
          step: withStep ? { ...step, document, filing: step.name === STEP_FILING ? filing : null } : null,
          resolvedTaskId: resolved && pendingTask ? pendingTask.id : null,
          semaforo: color,
        });
        if (r.error) toast(r.error, true);
        else {
          toast(withStep && step.name === STEP_TERMINATION ? `Causa terminada · ${client.full_name}` : `Revisión registrada · ${client.full_name}`);
          if (onSaved) onSaved(goNext && Boolean(hasNext));
          else onClose();
          router.refresh();
        }
      } catch (e) {
        toast((e as Error).message, true);
      }
    });
  };

  const due = pendingTask?.due_at ? dueLabel(pendingTask.due_at, tz) : null;

  // Atajos de teclado (revisar 30 causas seguidas sin tocar el ratón): 1 sin movimiento, 2 con movimiento, la letra
  // de cada color, Ctrl+Enter guarda (y pasa a la siguiente si la hay). Escribiendo en un campo, solo vale Ctrl+Enter.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (pending) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      save(Boolean(hasNext));
      return;
    }
    const t = e.target as HTMLElement;
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    const k = e.key.toLowerCase();
    if (k === "1") setMovement(false);
    else if (k === "2") setMovement(true);
    else if (k in COLOR_KEYS) setColor(COLOR_KEYS[k]);
    else return;
    e.preventDefault();
  };

  return (
    <Modal title={`Revisar · ${client.full_name}`} subtitle={[client.procedure_type, client.rol, client.tribunal].filter(Boolean).join(" · ") || "Sin datos de la causa"} onClose={onClose} busy={pending} wide>
      <div className="flex flex-col gap-4" onKeyDown={onKey}>
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
                <Icon name="check" size={15} /> Sin movimiento <kbd className="kbd">1</kbd>
              </span>
              <span className="text-[12px] text-muted">Nada nuevo en el portal. Se registra y vuelve a la cola en {cadence.days} días.</span>
            </button>
            <button type="button" className={`option-card ${movement === true ? "selected" : ""}`} aria-pressed={movement === true} onClick={() => setMovement(true)}>
              <span className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Icon name="history" size={15} /> Con movimiento <kbd className="kbd">2</kbd>
              </span>
              <span className="text-[12px] text-muted">Salió una resolución, el tribunal pidió algo o se hizo una gestión.</span>
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-muted">Color con que queda la causa</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Color de la causa">
              {SEMAFORO_KEYS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={color === k} className={`sem-chip ${color === k ? "selected" : ""}`} style={semaforoStyle(k)} title={SEMAFORO[k].hint} onClick={() => setColor(k)}>
                  <span className="sem-dot" aria-hidden /> {SEMAFORO[k].label} <kbd className="kbd">{KEY_OF[k]}</kbd>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={color === null} className={`sem-chip ${color === null ? "selected" : ""}`} onClick={() => setColor(null)}>
                <span className="sem-dot" aria-hidden /> Sin color <kbd className="kbd">0</kbd>
              </button>
            </div>
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
                    {stepSpec && (
                      <Field label={`${stepSpec.label}${stepSpec.required ? "" : " (opcional)"}`} className="sm:col-span-2">
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="input !py-1.5 text-[12.5px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12px]"
                          onChange={(e) => setStepFile(e.target.files?.[0] ?? null)}
                        />
                        <span className="mt-1 block text-[12px] text-muted">{stepSpec.hint}</span>
                      </Field>
                    )}
                    {step.name === STEP_FILING && (
                      <>
                        <Field label="Rol de la causa">
                          <input className="input tabnum" value={filing.rol} onChange={(e) => setFiling({ ...filing, rol: e.target.value })} placeholder="C-1234-2026" maxLength={40} />
                        </Field>
                        <Field label="Tribunal">
                          <input className="input" value={filing.tribunal} onChange={(e) => setFiling({ ...filing, tribunal: e.target.value })} placeholder="1º Juzgado Civil de Santiago" maxLength={120} />
                        </Field>
                        <Field label="Fecha de ingreso">
                          <input type="date" className="input tabnum" value={filing.intakeDate} onChange={(e) => setFiling({ ...filing, intakeDate: e.target.value })} />
                        </Field>
                      </>
                    )}
                    <span className="text-[12px] text-muted sm:col-span-2">
                      {step.name === STEP_TERMINATION ? "Con la resolución de término la causa queda cerrada como terminada." : "La nota de arriba queda como nota del paso. No hace falta volver a marcarlo en «Causa»."}
                    </span>
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
          <span className="flex flex-col gap-0.5 text-[12px] text-muted">
            <span>
              Próxima revisión: en {cadence.days} días · {cadence.reason}
            </span>
            <span className="text-faint">
              Atajos: <kbd className="kbd">1</kbd>/<kbd className="kbd">2</kbd> movimiento · letra del color · <kbd className="kbd">Ctrl</kbd>+<kbd className="kbd">Enter</kbd> guardar
            </span>
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            {hasNext ? (
              <>
                <button type="button" className="btn-secondary" onClick={() => save(false)} disabled={pending || movement === null}>
                  Guardar
                </button>
                <button type="button" className="btn-primary" onClick={() => save(true)} disabled={pending || movement === null} title="Guarda y abre la siguiente causa de la cola (Ctrl+Enter)">
                  {pending ? "Guardando…" : "Guardar y siguiente →"}
                </button>
              </>
            ) : (
              <button type="button" className="btn-primary" onClick={() => save(false)} disabled={pending || movement === null}>
                {pending ? "Guardando…" : "Guardar revisión"}
              </button>
            )}
          </span>
        </div>
      </div>
    </Modal>
  );
}

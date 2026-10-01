"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TaskClose } from "@/components/TaskClose";
import { dateTime, dueLabel, initials, relativeDays } from "@/lib/format";
import { TASK_KINDS, reviewCadence, stepsFor } from "@/lib/legal";
import type { LegalClient, LegalReview, LegalTask } from "@/lib/data";
import { ReviewDialog } from "./ReviewDialog";
import { quickReview } from "./actions";

type Props = {
  /** Posición dentro del mes de ingreso (1…N), como numera el estudio en su Excel. */
  seq: number | null;
  client: LegalClient;
  task: LegalTask | null;
  review: LegalReview | null;
  doneSteps: string[];
  tz: string;
  canReview: boolean;
  canTasks: boolean;
  lawyerName: string | null;
  lawyers: { id: string; name: string }[];
  userId: string;
};

// Una sola rejilla para cabecera y filas: así cada dato queda en su columna y la lista se lee como una tabla.
const GRID = "grid grid-cols-[32px_minmax(0,2.1fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto] items-center gap-x-4";

/** Cabecera de columnas de la cola (una por lista). */
export function ReviewHeader() {
  return (
    <div className={`${GRID} th-band border-b border-line px-4 py-2`} role="row">
      {["N°", "Causa", "Última revisión", "Próxima revisión", "Tarea pendiente", ""].map((h, i) => (
        <span key={i} className="th" role="columnheader">
          {h}
        </span>
      ))}
    </div>
  );
}

/**
 * Fila de la cola de revisión: la causa, quién la revisó por última vez y cuándo, cuándo vuelve a tocar, la tarea
 * pendiente y dos salidas: «Sin movimiento» (un clic) o «Revisar» (el diálogo completo).
 */
export function ReviewRow({ seq, client: c, task, review, doneSteps, tz, canReview, canTasks, lawyerName, lawyers, userId }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const href = `/clientes/${c.id}?tab=Causa`;
  const due = task?.due_at ? dueLabel(task.due_at, tz) : null;
  const step = c.current_step ?? stepsFor(c.procedure_type)[0] ?? null;
  const nextDue = c.next_review_at ? dueLabel(c.next_review_at, tz) : null;
  const cadence = reviewCadence(c.procedure_type, doneSteps);

  const noMovement = () =>
    start(async () => {
      const r = await quickReview(c.id);
      if (r.error) toast(r.error, true);
      else {
        toast(`Sin movimiento · ${c.full_name} · vuelve en ${cadence.days} días`);
        router.refresh();
      }
    });

  return (
    <div className={`${GRID} row min-h-[52px] px-4 py-2`} role="row" onClick={() => router.push(href)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(href)}>
      {/* N° dentro del mes */}
      <span className="tabnum text-[12px] font-semibold text-muted" role="cell" title={c.internal_number ? `Causa N° ${c.internal_number}` : undefined}>
        {seq ?? "—"}
      </span>

      {/* Causa */}
      <div className="flex min-w-0 flex-col gap-0.5" role="cell">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-fg">{c.full_name}</span>
          {c.procedure_type === "Renegociación" && <span className="tag brand">Renegociación</span>}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
          {c.rol ? <span className="tabnum text-soft">{c.rol}</span> : <span className="text-faint">Sin rol</span>}
          {step && <span className="truncate">· {step}</span>}
          {cadence.critical && c.procedure_type && (
            <span className="inline-flex items-center gap-1" title={`${cadence.reason}: se revisa cada ${cadence.days} días`}>
              · <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden /> Sin resolución
            </span>
          )}
          {lawyerName && <span className="truncate">· {lawyerName}</span>}
        </span>
      </div>

      {/* Última revisión */}
      <div className="flex min-w-0 items-center gap-2" role="cell">
        {review ? (
          <>
            <span className="avatar solid h-6 w-6 shrink-0 text-[9.5px]" aria-hidden>
              {initials(review.reviewer_name ?? "") || "?"}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-medium text-fg">{review.reviewer_name ?? "Sin nombre"}</span>
              <span className="truncate text-[11.5px] text-muted">
                {relativeDays(review.reviewed_at, tz)} · {dateTime(review.reviewed_at, tz)} · {review.had_movement ? "con movimiento" : "sin movimiento"}
              </span>
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-faint">Nunca revisada</span>
        )}
      </div>

      {/* Próxima revisión */}
      <div className="flex min-w-0 flex-col gap-0.5" role="cell">
        {nextDue ? (
          <span className={`tag tabnum self-start ${nextDue.overdue ? "danger" : nextDue.today ? "brand" : ""}`}>{nextDue.text}</span>
        ) : (
          <span className="text-[12.5px] font-medium text-warning">Ahora</span>
        )}
        <span className="text-[11px] text-faint">Cada {cadence.days} días</span>
      </div>

      {/* Tarea pendiente */}
      <div className="flex min-w-0 flex-col gap-0.5" role="cell">
        {task ? (
          <>
            <span className="truncate text-[12.5px] text-fg" title={task.title}>
              {task.title}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              <span>{TASK_KINDS[task.kind] ?? task.kind}</span>
              {due ? <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span> : <span className="tag warn">Sin fecha</span>}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-faint">Ninguna</span>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap" role="cell" onClick={(e) => e.stopPropagation()}>
        {task && canTasks && <TaskClose task={task} clientId={c.id} layout="row" allowCancel={false} />}
        {canReview ? (
          <>
            <button className="btn-ghost btn-sm" disabled={pending} onClick={noMovement} title={`Registrar que no hubo movimiento; vuelve a la cola en ${cadence.days} días`}>
              <Icon name="check" size={13} /> Sin movimiento
            </button>
            <button className="btn-primary btn-sm" disabled={pending} onClick={() => setOpen(true)}>
              Revisar
            </button>
          </>
        ) : (
          <Link href={href} className="btn-secondary btn-sm">
            Ver causa
          </Link>
        )}
      </div>

      {open && (
        <ReviewDialog client={c} pendingTask={task} lastReview={review} doneSteps={doneSteps} lawyers={lawyers} defaultAssignee={c.lawyer_id ?? userId} canTasks={canTasks} tz={tz} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

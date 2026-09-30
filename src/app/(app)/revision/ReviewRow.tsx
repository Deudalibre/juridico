"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TaskClose } from "@/components/TaskClose";
import { dateTime, dueLabel, initials, relativeDays } from "@/lib/format";
import { TASK_KINDS, procedureTone, stepsFor } from "@/lib/legal";
import type { LegalClient, LegalReview, LegalTask } from "@/lib/data";
import { ReviewDialog } from "./ReviewDialog";

type Props = {
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

/** Fila de la cola de revisión: la causa, su última revisión, la tarea pendiente y el botón «Revisar». */
export function ReviewRow({ client: c, task, review, doneSteps, tz, canReview, canTasks, lawyerName, lawyers, userId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const href = `/clientes/${c.id}?tab=Causa`;
  const due = task?.due_at ? dueLabel(task.due_at, tz) : null;
  const step = c.current_step ?? stepsFor(c.procedure_type)[0] ?? null;
  const nextDue = c.next_review_at ? dueLabel(c.next_review_at, tz) : null;

  return (
    <div className="row flex flex-wrap items-center gap-x-4 gap-y-2 py-3" onClick={() => router.push(href)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(href)}>
      <div className="flex min-w-[230px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold">{c.full_name}</span>
          {c.procedure_type && <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span>}
          {lawyerName && <span className="text-xs text-muted">{lawyerName}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
          {c.rol ? <span className="tabnum font-medium text-fg">{c.rol}</span> : <span className="text-faint">Sin rol aún</span>}
          {step && <span className="text-muted">Paso: {step}</span>}
        </div>
      </div>

      {/* Última revisión: quién la revisó (lo más importante), cuándo y si hubo movimiento */}
      <div className="flex min-w-[230px] flex-col gap-1 text-[12px]">
        {review ? (
          <>
            <span className="flex items-center gap-2">
              <span className="avatar solid h-6 w-6 shrink-0 text-[10px]" aria-hidden>
                {initials(review.reviewer_name ?? "") || "?"}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13px] font-semibold text-fg">Revisó {review.reviewer_name ?? "sin nombre"}</span>
                <span className="text-muted">
                  {relativeDays(review.reviewed_at, tz)} · {dateTime(review.reviewed_at, tz)}
                </span>
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`tag ${review.had_movement ? "brand" : ""}`}>{review.had_movement ? "Con movimiento" : "Sin movimiento"}</span>
              {nextDue && <span className={`text-[11.5px] ${nextDue.overdue ? "text-danger" : "text-faint"}`}>Próxima: {nextDue.text}</span>}
            </span>
          </>
        ) : (
          <span className="tag warn">Nunca revisada</span>
        )}
      </div>

      <div className="flex min-w-[200px] flex-col gap-1">
        {task ? (
          <>
            <span className="text-[12.5px] font-medium text-fg">{task.title}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
              {TASK_KINDS[task.kind] ?? task.kind}
              {due ? <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span> : <span className="tag warn">Sin fecha</span>}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-faint">Sin tarea pendiente</span>
        )}
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {task && canTasks && <TaskClose task={task} clientId={c.id} mode="popover" />}
        {canReview ? (
          <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            Revisar
          </button>
        ) : (
          <Link href={href} className="btn-secondary btn-sm">
            Ver causa
          </Link>
        )}
      </div>

      {open && <ReviewDialog client={c} pendingTask={task} doneSteps={doneSteps} lawyers={lawyers} defaultAssignee={c.lawyer_id ?? userId} canTasks={canTasks} tz={tz} onClose={() => setOpen(false)} />}
    </div>
  );
}

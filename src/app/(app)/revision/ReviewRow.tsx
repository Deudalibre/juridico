"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TaskClose } from "@/components/TaskClose";
import { dateTime, dueLabel, initials, relativeDays } from "@/lib/format";
import { TASK_KINDS, procedureTone, reviewCadence, stepsFor } from "@/lib/legal";
import type { LegalClient, LegalReview, LegalTask } from "@/lib/data";
import { ReviewDialog } from "./ReviewDialog";
import { quickReview } from "./actions";

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

/** Bloque con su rótulo: así se distingue de un vistazo qué es la última revisión, cuándo toca la próxima y qué tarea hay. */
function Block({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 border-line-soft lg:border-l lg:pl-4 ${className}`}>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</span>
      {children}
    </div>
  );
}

/**
 * Fila de la cola de revisión, en bloques rotulados: la causa · última revisión (quién y cuándo) · próxima
 * revisión · tarea pendiente · acciones («Sin movimiento» en un clic o «Revisar» con el diálogo completo).
 */
export function ReviewRow({ client: c, task, review, doneSteps, tz, canReview, canTasks, lawyerName, lawyers, userId }: Props) {
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
    <div className="row flex flex-wrap items-center gap-x-4 gap-y-3 py-3" onClick={() => router.push(href)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(href)}>
      {/* La causa */}
      <div className="flex min-w-[230px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold">{c.full_name}</span>
          {c.procedure_type && <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span>}
          {cadence.critical && c.procedure_type && (
            <span className="tag warn" title={`${cadence.reason}: se revisa cada ${cadence.days} días`}>
              {cadence.label}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
          {c.rol ? <span className="tabnum font-medium text-fg">{c.rol}</span> : <span className="text-faint">Sin rol aún</span>}
          {step && <span className="text-muted">Paso: {step}</span>}
          {lawyerName && <span className="text-muted">· {lawyerName}</span>}
        </div>
      </div>

      {/* Última revisión: quién y cuándo */}
      <Block label="Última revisión" className="min-w-[210px]">
        {review ? (
          <span className="flex items-center gap-2">
            <span className="avatar solid h-7 w-7 shrink-0 text-[10.5px]" aria-hidden>
              {initials(review.reviewer_name ?? "") || "?"}
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold text-fg">{review.reviewer_name ?? "Sin nombre"}</span>
              <span className="text-[12px] text-muted">
                {relativeDays(review.reviewed_at, tz)} · {dateTime(review.reviewed_at, tz)}
              </span>
              <span className={`mt-0.5 self-start tag ${review.had_movement ? "brand" : ""}`}>{review.had_movement ? "Con movimiento" : "Sin movimiento"}</span>
            </span>
          </span>
        ) : (
          <span className="tag warn self-start">Nunca revisada</span>
        )}
      </Block>

      {/* Próxima revisión: cuándo vuelve a tocar y por qué */}
      <Block label="Próxima revisión" className="min-w-[150px]">
        {nextDue ? (
          <>
            <span className={`tag tabnum self-start ${nextDue.overdue ? "danger" : nextDue.today ? "brand" : ""}`}>{nextDue.overdue ? `Atrasada · ${nextDue.text}` : nextDue.text}</span>
            <span className="text-[11.5px] text-muted">
              Cada {cadence.days} días · {cadence.reason}
            </span>
          </>
        ) : (
          <>
            <span className="tag warn self-start">Ahora</span>
            <span className="text-[11.5px] text-muted">Aún no tiene fecha</span>
          </>
        )}
      </Block>

      {/* Tarea pendiente: qué hay que hacer y cuándo vence */}
      <Block label="Tarea pendiente" className="min-w-[210px] max-w-[320px]">
        {task ? (
          <>
            <span className="truncate text-[12.5px] font-medium text-fg" title={task.title}>
              {task.title}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
              <span>{TASK_KINDS[task.kind] ?? task.kind}</span>
              {due ? <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.overdue ? `Vencida · ${due.text}` : `Vence ${due.text}`}</span> : <span className="tag warn">Sin fecha</span>}
            </span>
          </>
        ) : (
          <span className="text-[12.5px] text-faint">Ninguna</span>
        )}
      </Block>

      {/* Cerrar la tarea: los botones quedan aquí y el recuadro de resultado ocupa toda la fila */}
      {task && canTasks && <TaskClose task={task} clientId={c.id} layout="row" allowCancel={false} />}

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {canReview ? (
          <>
            <button className="btn-secondary btn-sm" disabled={pending} onClick={noMovement} title={`Registrar que no hubo movimiento; vuelve a la cola en ${cadence.days} días`}>
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

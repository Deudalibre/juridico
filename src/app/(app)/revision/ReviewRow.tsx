"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ContactButtons } from "@/components/ContactButtons";
import { Icon } from "@/components/icons";
import { TaskClose } from "@/components/TaskClose";
import { dateTime, dueLabel, initials, relativeDays, shortDate, timeOf } from "@/lib/format";
import { SEMAFORO, TASK_KINDS, isSemaforo, reviewCadence, semaforoStyle } from "@/lib/legal";
import type { LegalClient, LegalReview, LegalTask } from "@/lib/data";
import { ReviewDialog } from "./ReviewDialog";
import { useReviewQueue } from "./ReviewQueue";

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
// La columna de acciones tiene ancho fijo: con «auto» cada grupo la calculaba a su manera y «Última revisión» se
// corría de una tabla a otra (con o sin botón «Completar»).
// Última revisión va compacta (quién y cuándo en una línea) y la tarea pendiente, que es lo que hay que hacer, se lleva
// el ancho y un recuadro propio (pedido del estudio, 2026-10-06)
const GRID = "grid grid-cols-[32px_minmax(0,2fr)_176px_minmax(0,1fr)_minmax(0,2.8fr)_200px] items-center gap-x-4";

/** Cabecera de columnas de la cola (una por lista). */
export function ReviewHeader() {
  return (
    <div className={`${GRID} th-band border-b border-line px-4 py-2`} role="row">
      {["N°", "Causa", "Estado", "Última revisión", "Tarea pendiente", ""].map((h, i) => (
        <span key={i} className="th" role="columnheader">
          {h}
        </span>
      ))}
    </div>
  );
}

/**
 * Fila de la cola de revisión: la causa, su color, quién la revisó por última vez, la tarea pendiente y un solo botón,
 * «Revisar», que abre el diálogo (ahí se elige «Sin movimiento» o «Con movimiento»). El estudio pidió la fila lo más
 * limpia posible (2026-10-06): nombre y rol a la izquierda, nada más; el paso, la cadencia y el abogado quedan en el
 * título de la fila y en la ficha.
 */
export function ReviewRow({ seq, client: c, task, review, doneSteps, tz, canReview, canTasks, lawyerName, lawyers, userId }: Props) {
  const router = useRouter();
  // El diálogo lo gobierna la cola (para encadenar «Guardar y siguiente»); si la fila está fuera de la cola, estado local
  const queue = useReviewQueue();
  const [localOpen, setLocalOpen] = useState(false);
  const open = queue ? queue.openId === c.id : localOpen;
  const setOpen = (v: boolean) => (queue ? queue.open(v ? c.id : null) : setLocalOpen(v));
  const nextId = queue?.nextAfter(c.id) ?? null;
  const href = `/clientes/${c.id}?tab=Causa`;
  const due = task?.due_at ? dueLabel(task.due_at, tz) : null;
  // Plazo de la tarea en lenguaje de agenda: «Venció el 22 sep», «Hoy · 10:00», «Mañana · 10:00», «Vence el 11 oct»
  const dueText = !task?.due_at
    ? "Sin plazo"
    : due!.overdue
      ? `Venció el ${shortDate(task.due_at, tz)}`
      : due!.today
        ? `Hoy · ${timeOf(task.due_at, tz)}`
        : due!.text.startsWith("Mañana")
          ? `Mañana · ${timeOf(task.due_at, tz)}`
          : `Vence el ${shortDate(task.due_at, tz)}`;
  // El tipo de tarea solo se muestra si aporta: «Otra» no dice nada y «Apercibimiento» ya va en el título
  const kindLabel = task ? (TASK_KINDS[task.kind] ?? task.kind) : null;
  const showKind = Boolean(task && kindLabel && task.kind !== "otra" && !task.title.toLowerCase().startsWith(kindLabel.toLowerCase()));
  const nextDue = c.next_review_at ? dueLabel(c.next_review_at, tz) : null;
  const cadence = reviewCadence(c.procedure_type, doneSteps);
  // La fecha de la próxima revisión no se muestra en la fila (se confundía con la última y con la tarea): queda en el
  // título de la fila, y solo cuando toca aparece una alerta junto al nombre. «Nunca revisada» ya lo dice la columna
  // Última revisión, así que la primera revisión no lleva etiqueta.
  const alert =
    review && nextDue?.overdue
      ? {
          text: `Toca revisar · desde el ${shortDate(c.next_review_at!, tz)}`,
          tone: "danger",
        }
      : review && nextDue?.today
        ? { text: "Toca revisar · hoy", tone: "warn" }
        : null;
  const rowTitle = [
    `Próxima revisión: ${c.next_review_at ? dateTime(c.next_review_at, tz) : "pendiente"} · cada ${cadence.days} días`,
    cadence.critical && c.procedure_type ? cadence.reason : null,
    lawyerName ? `Abogado: ${lawyerName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={`${GRID} row min-h-[52px] px-4 py-2 ${isSemaforo(c.semaforo) ? "sem-row" : ""}`}
      style={semaforoStyle(c.semaforo)}
      role="row"
      title={rowTitle}
      onClick={() => router.push(href)}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && router.push(href)}
    >
      {/* N° dentro del mes */}
      <span className="tabnum text-[12px] font-semibold text-muted" role="cell" title={c.internal_number ? `Causa N° ${c.internal_number}` : undefined}>
        {seq ?? "—"}
      </span>

      {/* Causa */}
      <div className="flex min-w-0 flex-col gap-0.5" role="cell">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-fg">{c.full_name}</span>
          {c.procedure_type === "Renegociación" && <span className="tag brand">Renegociación</span>}
          {alert && <span className={`tag ${alert.tone} shrink-0`}>{alert.text}</span>}
        </span>
        <span className="tabnum truncate text-[11.5px] text-muted">{c.rol ?? <span className="text-faint">Sin rol</span>}</span>
      </div>

      {/* Estado (semáforo): solo se muestra; se cambia dentro de «Revisar», para no hacer dos gestiones por causa */}
      <div className="min-w-0" role="cell">
        {isSemaforo(c.semaforo) ? (
          <span className="sem-trigger compact" style={semaforoStyle(c.semaforo)} title={SEMAFORO[c.semaforo].hint}>
            <span className="sem-dot" aria-hidden />
            <span className="sem-label">{SEMAFORO[c.semaforo].label}</span>
          </span>
        ) : (
          <span className="text-[12px] text-faint">Sin color</span>
        )}
      </div>

      {/* Última revisión: compacta; el detalle completo (fecha, hora, nombre) queda en el título */}
      <div className="flex min-w-0 items-center gap-2" role="cell">
        {review ? (
          <span className="flex min-w-0 items-center gap-1.5" title={`${dateTime(review.reviewed_at, tz)} · ${review.reviewer_name ?? "Sin nombre"} · ${review.had_movement ? "con movimiento" : "sin movimiento"}`}>
            <span className="avatar solid h-5 w-5 shrink-0 text-[8.5px]" aria-hidden>
              {initials(review.reviewer_name ?? "") || "?"}
            </span>
            <span className="truncate text-[12px] text-soft">
              {relativeDays(review.reviewed_at, tz)} · {review.had_movement ? "con mov." : "sin mov."}
            </span>
          </span>
        ) : (
          <span className="text-[12px] text-faint">Nunca revisada</span>
        )}
      </div>

      {/* Tarea pendiente: recuadro propio, con icono según el tipo y el plazo a la derecha */}
      <div className="min-w-0" role="cell">
        {task ? (
          <div className={`task-box ${due?.overdue ? "overdue" : due?.today ? "today" : ""}`} title={task.title}>
            <Icon name={task.kind === "apercibimiento" ? "alert" : task.kind === "audiencia" ? "calendar" : "tasks"} size={14} />
            <span className="flex min-w-0 flex-1 basis-0 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-semibold text-fg">{task.title}</span>
              {showKind && <span className="truncate text-[11px] text-muted">{kindLabel}</span>}
            </span>
            <span className={`task-due tabnum ${due ? (due.overdue ? "danger" : due.today ? "brand" : "") : "none"}`} title={task.due_at ? dateTime(task.due_at, tz) : "Tarea sin plazo"}>
              <Icon name={due?.overdue ? "alert" : "clock"} size={11} />
              {dueText}
            </span>
            {/* «Completar» vive dentro del recuadro de la tarea: es su acción, no una de la causa */}
            {canTasks && (
              <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <TaskClose task={task} clientId={c.id} layout="row" allowCancel={false} />
              </span>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-faint">Sin tarea</span>
        )}
      </div>

      {/* Acciones: contacto con el cliente y el portal del Poder Judicial a un clic; luego la tarea y «Revisar» */}
      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap" role="cell" onClick={(e) => e.stopPropagation()}>
        <span className="mr-1 flex items-center gap-1">
          <ContactButtons phone={c.phone} name={c.full_name} />
          {c.pjud_url && (
            <a href={c.pjud_url} target="_blank" rel="noopener noreferrer" className="icon-btn contact pjud" title="Abrir la causa en el Poder Judicial" aria-label="Causa en el Poder Judicial">
              <Icon name="external" size={14} />
            </a>
          )}
        </span>
        {canReview ? (
          <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            Revisar
          </button>
        ) : (
          <Link href={href} className="btn-secondary btn-sm">
            Ver causa
          </Link>
        )}
      </div>

      {/* El diálogo se monta en un portal, pero sus eventos de React burbujean hasta la fila: se cortan aquí para que
          un Enter o un clic dentro del diálogo no abra la ficha */}
      {open && (
        <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ReviewDialog
            client={c}
            pendingTask={task}
            lastReview={review}
            doneSteps={doneSteps}
            lawyers={lawyers}
            defaultAssignee={c.lawyer_id ?? userId}
            canTasks={canTasks}
            tz={tz}
            hasNext={Boolean(nextId)}
            onClose={() => setOpen(false)}
            onSaved={(goNext) => (goNext && nextId && queue ? queue.open(nextId) : setOpen(false))}
          />
        </span>
      )}
    </div>
  );
}

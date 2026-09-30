"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { finishTask } from "@/app/(app)/clientes/actions";
import { toast } from "@/components/ui";
import { dueLabel } from "@/lib/format";
import { TASK_KINDS, procedureTone, stepsFor } from "@/lib/legal";
import type { LegalClient, LegalTask } from "@/lib/data";

type Props = { task: LegalTask | null; client: LegalClient; tz: string; canTasks: boolean; showLawyer?: string | null };

/** Fila de trabajo de «Mi día»: la causa, qué toca hacer y el botón para hacerlo (como WorkRow en el CRM). */
export function TaskRow({ task, client: c, tz, canTasks, showLawyer }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const href = `/clientes/${c.id}?tab=Causa`;
  const due = task?.due_at ? dueLabel(task.due_at, tz) : null;
  const step = c.current_step ?? stepsFor(c.procedure_type)[0] ?? null;
  const run = (status: "completada" | "cancelada", msg: string) =>
    start(async () => {
      if (!task) return;
      const r = await finishTask(task.id, c.id, status);
      if (r.error) toast(r.error, true);
      else {
        toast(msg);
        router.refresh();
      }
    });

  return (
    <div className="row flex flex-wrap items-center gap-x-4 gap-y-2 py-3" onClick={() => router.push(href)} role="link" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && router.push(href)}>
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold">{c.full_name}</span>
          {c.procedure_type && <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span>}
          {showLawyer && <span className="text-xs text-muted">{showLawyer}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px]">
          {c.rol ? <span className="tabnum font-medium text-fg">{c.rol}</span> : <span className="text-faint">Sin rol aún</span>}
          {step && <span className="text-muted">Paso: {step}</span>}
        </div>
      </div>

      <div className="flex min-w-[220px] flex-col gap-1">
        {task ? (
          <>
            <span className="text-[12.5px] font-medium text-fg">{task.title}</span>
            <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
              {TASK_KINDS[task.kind] ?? task.kind}
              {due ? <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span> : <span className="tag warn">Sin fecha</span>}
            </span>
          </>
        ) : (
          <span className="tag warn">Sin próxima acción</span>
        )}
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {task && canTasks ? (
          <>
            <button className="btn-outline btn-sm" disabled={pending} onClick={() => run("completada", "Tarea completada")}>
              Completar
            </button>
            <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run("cancelada", "Tarea cancelada")}>
              Cancelar
            </button>
          </>
        ) : (
          <Link href={href} className="btn-secondary btn-sm">
            {task ? "Ver causa" : "Programar"}
          </Link>
        )}
      </div>
    </div>
  );
}

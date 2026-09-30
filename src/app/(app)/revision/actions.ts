"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { zonedToIso } from "@/lib/format";
import { REVIEW_INTERVALS, TASK_KINDS } from "@/lib/legal";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export type ReviewInput = {
  hadMovement: boolean;
  note: string;
  /** Días hasta la próxima revisión (uno de REVIEW_INTERVALS) */
  nextDays: number;
  task: { title: string; kind: string; dueLocal: string; assigneeId: string } | null;
};

/**
 * Registra la revisión de una causa: si hubo movimiento, la nota, la tarea que queda pendiente (opcional) y
 * cuándo vuelve a tocar revisarla. El trigger de la base actualiza la causa, el historial y avisa al responsable.
 */
export async function reviewCase(clientId: string, input: ReviewInput): Promise<Result> {
  const { supabase, user, can, tz } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para revisar causas." };
  if (!isUuid(clientId)) return { error: "Causa no válida." };
  const interval = REVIEW_INTERVALS.find((i) => i.days === input.nextDays) ?? null;
  if (!interval) return { error: "Elige cuándo vuelve a tocar revisar la causa." };
  const note = input.note.trim().slice(0, 2000);
  if (input.hadMovement && !note) return { error: "Si hubo movimiento, anota qué pasó (qué resolvió o pidió el tribunal)." };

  let taskId: string | null = null;
  if (input.task) {
    if (!can("legal.tasks")) return { error: "No tienes permiso para dejar tareas." };
    const title = input.task.title.trim().slice(0, 200);
    if (!title) return { error: "Indica qué queda pendiente." };
    if (!(input.task.kind in TASK_KINDS)) return { error: "Tipo de tarea no reconocido." };
    const due = input.task.dueLocal ? zonedToIso(input.task.dueLocal, tz) : null;
    if (input.task.dueLocal && !due) return { error: "La fecha de la tarea no es válida." };
    const assignee = input.task.assigneeId && isUuid(input.task.assigneeId) ? input.task.assigneeId : null;
    const { data, error } = await supabase
      .from("legal_tasks")
      .insert({ client_id: clientId, kind: input.task.kind, title, due_at: due, assignee_id: assignee, description: note || null })
      .select("id")
      .single();
    if (error) return { error: error.message };
    taskId = data.id;
  }

  const next = new Date(Date.now() + interval.days * 86400_000);
  next.setUTCHours(12, 0, 0, 0); // mediodía UTC: cae dentro del día correcto en Chile
  const { error } = await supabase
    .from("legal_reviews")
    .insert({ client_id: clientId, reviewed_by: user.id, had_movement: input.hadMovement, note: note || null, next_review_at: next.toISOString(), task_id: taskId });
  if (error) return { error: error.message };
  revalidatePath("/revision");
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  return {};
}

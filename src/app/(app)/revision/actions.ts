"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { zonedToIso } from "@/lib/format";
import { REVIEW_INTERVALS, TASK_KINDS } from "@/lib/legal";
import { applyStep } from "@/lib/case-steps";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

export type ReviewInput = {
  hadMovement: boolean;
  note: string;
  /** Días hasta la próxima revisión (uno de REVIEW_INTERVALS) */
  nextDays: number;
  task: { title: string; kind: string; dueLocal: string; assigneeId: string } | null;
  /** Paso de la causa que quedó hecho con este movimiento (opcional). La nota de la revisión pasa a ser la nota del paso. */
  step: { name: string; date: string; liquidator: string } | null;
  /** Tarea pendiente que quedó resuelta al revisar (opcional). */
  resolvedTaskId: string | null;
};

/**
 * Registra la revisión de una causa en una sola interacción: si hubo movimiento, la nota, el paso que avanzó
 * (opcional), la tarea que quedó resuelta (opcional), la que queda pendiente (opcional) y cuándo vuelve a tocar
 * revisarla. El trigger de la base actualiza la causa, el historial y avisa al responsable.
 */
export async function reviewCase(clientId: string, input: ReviewInput): Promise<Result> {
  const { supabase, user, can, tz } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para revisar causas." };
  if (!isUuid(clientId)) return { error: "Causa no válida." };
  const interval = REVIEW_INTERVALS.find((i) => i.days === input.nextDays) ?? null;
  if (!interval) return { error: "Elige cuándo vuelve a tocar revisar la causa." };
  const note = input.note.trim().slice(0, 2000);
  if (input.hadMovement && !note) return { error: "Si hubo movimiento, anota qué pasó (qué resolvió o pidió el tribunal)." };

  // Avance de paso: solo tiene sentido si hubo movimiento
  if (input.step) {
    if (!input.hadMovement) return { error: "Para marcar un paso, indica que la causa tuvo movimiento." };
    const r = await applyStep(supabase, clientId, { step: input.step.name, date: input.step.date, note, liquidator: input.step.liquidator });
    if (r.error) return r;
  }

  // Tarea pendiente que quedó resuelta con esta revisión
  if (input.resolvedTaskId) {
    if (!can("legal.tasks")) return { error: "No tienes permiso para gestionar tareas." };
    if (!isUuid(input.resolvedTaskId)) return { error: "Tarea no válida." };
    if (note.length < 3) return { error: "Si la tarea quedó resuelta, anota el resultado en la nota: queda como registro." };
    const { error } = await supabase
      .from("legal_tasks")
      .update({ status: "completada", completed_at: new Date().toISOString(), result: note, closed_by: user.id })
      .eq("id", input.resolvedTaskId)
      .eq("client_id", clientId)
      .eq("status", "pendiente");
    if (error) return { error: error.message };
  }

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
  revalidatePath("/revision/tareas");
  return {};
}

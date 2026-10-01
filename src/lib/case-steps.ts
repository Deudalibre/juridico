import type { SupabaseClient } from "@supabase/supabase-js";
import { REVIEW_EVERY_DAYS, STEP_LIQUIDATOR, STEP_RESOLUTION, currentStep, reviewCadence, stepsFor } from "@/lib/legal";

// Lógica compartida para marcar un paso de la causa como hecho. La usan dos acciones: «Marcar hecho» en la
// pestaña Causa y «Revisar» en la cola de revisión, así el abogado registra el avance una sola vez.

export type StepInput = { step: string; date: string; note: string | null; liquidator: string | null };
type Result = { error?: string };

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Fecha de la próxima revisión a `days` días, a mediodía UTC (cae dentro del día correcto en Chile). */
export function nextReviewAt(days = REVIEW_EVERY_DAYS): string {
  const next = new Date(Date.now() + days * 86400_000);
  next.setUTCHours(12, 0, 0, 0);
  return next.toISOString();
}

/** Días hasta la próxima revisión según el estado actual de la causa (se llama después de aplicar el paso). */
export async function cadenceDays(supabase: SupabaseClient, clientId: string): Promise<number> {
  const { client, done } = await stepContext(supabase, clientId);
  return reviewCadence(client?.procedure_type, done).days;
}

/** Carga lo mínimo de la causa y sus pasos hechos para validar un cambio de paso. */
export async function stepContext(supabase: SupabaseClient, clientId: string) {
  const [{ data: client }, { data: steps }] = await Promise.all([
    supabase.from("legal_clients").select("id, procedure_type, archived_at").eq("id", clientId).maybeSingle(),
    supabase.from("legal_case_steps").select("step").eq("client_id", clientId),
  ]);
  return { client: client as { id: string; procedure_type: string | null; archived_at: string | null } | null, done: (steps ?? []).map((s) => s.step as string) };
}

/**
 * Registra el paso (upsert), recalcula el paso actual y guarda los datos propios del paso (liquidador, fecha de
 * la resolución). No revalida rutas ni registra la revisión: eso lo decide cada acción.
 */
export async function applyStep(supabase: SupabaseClient, clientId: string, input: StepInput): Promise<Result> {
  const { client, done } = await stepContext(supabase, clientId);
  if (!client) return { error: "Cliente no encontrado." };
  if (client.archived_at) return { error: "La causa está cerrada; reábrela para seguir." };
  const steps = stepsFor(client.procedure_type);
  if (!input.step || !steps.includes(input.step)) return { error: "Ese paso no pertenece al procedimiento de esta causa." };
  if (!isDate(input.date)) return { error: "La fecha del paso no es válida." };
  const liquidator = input.liquidator?.trim() || null;
  if (input.step === STEP_LIQUIDATOR && !liquidator) return { error: "Indica el nombre del liquidador que figura en el certificado." };

  const ins = await supabase.from("legal_case_steps").upsert({ client_id: clientId, step: input.step, completed_at: input.date, note: input.note?.trim() || null }, { onConflict: "client_id,step" });
  if (ins.error) return { error: ins.error.message };
  const patch: Record<string, unknown> = { current_step: currentStep(client.procedure_type, [...done, input.step]) };
  if (input.step === STEP_LIQUIDATOR) patch.liquidator_name = liquidator;
  if (input.step === STEP_RESOLUTION) patch.liquidation_resolution_at = input.date;
  const upd = await supabase.from("legal_clients").update(patch).eq("id", clientId);
  if (upd.error) return { error: upd.error.message };
  return {};
}

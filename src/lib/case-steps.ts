import type { SupabaseClient } from "@supabase/supabase-js";
import { REVIEW_EVERY_DAYS, STEP_DOCS, STEP_FILING, STEP_LIQUIDATOR, STEP_RESOLUTION, currentStep, reviewCadence, stepsFor } from "@/lib/legal";

// Lógica compartida para marcar un paso de la causa como hecho. La usan dos acciones: «Marcar hecho» en la
// pestaña Causa y «Revisar» en la cola de revisión, así el abogado registra el avance una sola vez.

export type StepDocument = { path: string; size: number; mime: string; fileName: string };
export type StepInput = {
  step: string;
  date: string;
  note: string | null;
  liquidator: string | null;
  /** Comprobante ya subido al bucket legal-documents (certificado o resolución) */
  document: StepDocument | null;
  /** Datos de la causa que llegan con el certificado de envío (Ingreso de demanda) */
  filing: { rol: string | null; tribunal: string | null; intakeDate: string | null } | null;
};
type Result = { error?: string };

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

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

/** Registra en el almacén de la causa el comprobante ya subido por el navegador. Devuelve el id del documento. */
async function registerStepDocument(supabase: SupabaseClient, clientId: string, label: string, doc: StepDocument): Promise<{ id?: string; error?: string }> {
  if (!doc.path.startsWith(`${clientId}/`) || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(doc.path)) return { error: "Ruta del comprobante no válida." };
  if (!Number.isFinite(doc.size) || doc.size <= 0) return { error: "El comprobante está vacío." };
  const { data, error } = await supabase
    .from("legal_documents")
    .insert({ client_id: clientId, name: label, doc_type: "comprobante", status: "recibido", storage_path: doc.path, file_size: doc.size, mime: doc.mime, notes: doc.fileName.slice(0, 200), version: 1 })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

/**
 * Registra el paso (upsert), su comprobante si lo exige, recalcula el paso actual y guarda los datos propios del
 * paso (rol/tribunal/fecha con el certificado de envío, liquidador, fecha de la resolución). La resolución de
 * término cierra la causa (trigger legal_case_steps_terminate). No revalida rutas ni registra la revisión.
 */
export async function applyStep(supabase: SupabaseClient, clientId: string, input: StepInput): Promise<Result> {
  if (!isUuid(clientId)) return { error: "Cliente no válido." };
  const { client, done } = await stepContext(supabase, clientId);
  if (!client) return { error: "Cliente no encontrado." };
  if (client.archived_at) return { error: "La causa está cerrada; reábrela para seguir." };
  const steps = stepsFor(client.procedure_type);
  if (!input.step || !steps.includes(input.step)) return { error: "Ese paso no pertenece al procedimiento de esta causa." };
  if (!isDate(input.date)) return { error: "La fecha del paso no es válida." };
  const liquidator = input.liquidator?.trim() || null;
  if (input.step === STEP_LIQUIDATOR && !liquidator) return { error: "Indica el nombre del liquidador que figura en el certificado." };
  const docSpec = STEP_DOCS[input.step];
  if (docSpec?.required && !input.document) return { error: `Adjunta el ${docSpec.label}: es lo que acredita este paso.` };

  let documentId: string | null = null;
  if (input.document && docSpec) {
    const r = await registerStepDocument(supabase, clientId, docSpec.label, input.document);
    if (r.error) return { error: r.error };
    documentId = r.id ?? null;
  }

  // Con el certificado de envío llegan el rol, el tribunal y la fecha de ingreso (se pueden corregir a mano después)
  if (input.step === STEP_FILING && input.filing) {
    const patch: Record<string, unknown> = {};
    if (input.filing.rol?.trim()) patch.rol = input.filing.rol.trim().slice(0, 40);
    if (input.filing.tribunal?.trim()) patch.tribunal = input.filing.tribunal.trim().slice(0, 120);
    if (input.filing.intakeDate && isDate(input.filing.intakeDate)) patch.intake_date = input.filing.intakeDate;
    if (Object.keys(patch).length) {
      const upd = await supabase.from("legal_clients").update(patch).eq("id", clientId);
      if (upd.error) return { error: upd.error.message };
    }
  }

  const ins = await supabase
    .from("legal_case_steps")
    .upsert({ client_id: clientId, step: input.step, completed_at: input.date, note: input.note?.trim() || null, document_id: documentId }, { onConflict: "client_id,step" });
  if (ins.error) return { error: ins.error.message };
  const patch: Record<string, unknown> = { current_step: currentStep(client.procedure_type, [...done, input.step]) };
  if (input.step === STEP_LIQUIDATOR) patch.liquidator_name = liquidator;
  if (input.step === STEP_RESOLUTION) patch.liquidation_resolution_at = input.date;
  const upd = await supabase.from("legal_clients").update(patch).eq("id", clientId);
  if (upd.error) return { error: upd.error.message };
  return {};
}

/** Lee del FormData los campos del comprobante y del ingreso que manda el navegador. */
export function stepInputFromForm(fd: FormData, step: string, date: string, note: string | null, liquidator: string | null): StepInput {
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const path = s("doc_path");
  return {
    step,
    date,
    note,
    liquidator,
    document: path ? { path, size: Number(fd.get("doc_size") ?? 0), mime: s("doc_mime") ?? "", fileName: s("doc_name") ?? "comprobante" } : null,
    filing: step === STEP_FILING ? { rol: s("rol"), tribunal: s("tribunal"), intakeDate: s("intake_date") } : null,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { cleanRut, isValidRut } from "@/lib/rut";
import { zonedToIso } from "@/lib/format";
import { CLOSE_REASONS, STEP_RESOLUTION, TASK_KINDS, currentStep, isProcedure, isSemaforo } from "@/lib/legal";
import { applyStep, cadenceDays, nextReviewAt, stepContext, stepInputFromForm } from "@/lib/case-steps";

type Result = { error?: string };

const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim() || null;
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

/** Datos personales y de la causa (una sola fuente para los documentos). */
export async function saveClientBasics(id: string, fd: FormData): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const full_name = text(fd, "full_name");
  if (!full_name) return { error: "Indica el nombre completo." };
  const rutRaw = text(fd, "rut");
  // Control formal (formato y dígito verificador), no verificación de identidad
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT no tiene un formato o dígito verificador válido." };
  const procedure = text(fd, "procedure_type");
  if (procedure && !isProcedure(procedure)) return { error: "Procedimiento no reconocido." };
  const intake = text(fd, "intake_date");
  if (intake && !isDate(intake)) return { error: "La fecha de ingreso no es válida." };
  const email = text(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El email no es válido." };

  const { error } = await supabase
    .from("legal_clients")
    .update({
      full_name,
      rut: rutRaw ? cleanRut(rutRaw) : null,
      phone: text(fd, "phone"),
      email,
      procedure_type: procedure,
      tribunal: text(fd, "tribunal"),
      rol: text(fd, "rol"),
      caratula: text(fd, "caratula"),
      intake_date: intake,
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

/** Enlaces externos: carpeta del cliente (Drive) y ficha de la causa (Poder Judicial). */
export async function saveClientLinks(id: string, fd: FormData): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const drive = text(fd, "drive_folder_url");
  const pjud = text(fd, "pjud_url");
  if (drive && !isHttpUrl(drive)) return { error: "El enlace de la carpeta no es una dirección web válida." };
  if (pjud && !isHttpUrl(pjud)) return { error: "El enlace de la ficha jurídica no es una dirección web válida." };
  const { error } = await supabase.from("legal_clients").update({ drive_folder_url: drive, pjud_url: pjud }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

/** Abogado a cargo (la base exige legal.assign; cada cambio queda en el historial). */
export async function assignLawyer(id: string, lawyerId: string | null): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.assign")) return { error: "Solo el administrador asigna el abogado a cargo." };
  if (!isUuid(id) || (lawyerId && !isUuid(lawyerId))) return { error: "Datos no válidos." };
  const { error } = await supabase.from("legal_clients").update({ lawyer_id: lawyerId }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

/** Color de la causa (semáforo del estudio). Vacío = sin color. El trigger deja el cambio en el historial. */
export async function setSemaforo(id: string, value: string | null): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar la causa." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  if (value && !isSemaforo(value)) return { error: "Color no reconocido." };
  const { error } = await supabase.from("legal_clients").update({ semaforo: value || null }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  revalidatePath("/revision");
  return {};
}

/** Guardar, cambiar o quitar (vacío) la Clave Única. Va cifrada a la bóveda; la base registra la acción. */
export async function setClaveUnica(id: string, value: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar la Clave Única." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const { error } = await supabase.rpc("legal_set_clave_unica", { p_client: id, p_value: value });
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  return {};
}

/** Mostrar la Clave Única. Cada vista queda registrada en la auditoría (quién, cuándo, qué cliente). */
export async function revealClaveUnica(id: string): Promise<Result & { value?: string | null }> {
  const { supabase, can } = await getContext();
  if (!can("legal.view")) return { error: "No tienes permiso para ver la Clave Única." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const { data, error } = await supabase.rpc("legal_get_clave_unica", { p_client: id });
  if (error) return { error: error.message };
  return { value: (data as string | null) ?? null };
}

/** Alta manual de un cliente (los que vienen del CRM se crean desde la ficha del lead). */
export async function createLegalClient(fd: FormData): Promise<Result & { id?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.create")) return { error: "No tienes permiso para crear clientes." };
  const full_name = text(fd, "full_name");
  if (!full_name) return { error: "Indica el nombre completo." };
  const rutRaw = text(fd, "rut");
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT no tiene un formato o dígito verificador válido." };
  const procedure = text(fd, "procedure_type");
  if (procedure && !isProcedure(procedure)) return { error: "Procedimiento no reconocido." };
  const intake = text(fd, "intake_date");
  if (intake && !isDate(intake)) return { error: "La fecha de ingreso no es válida." };
  const { data, error } = await supabase
    .from("legal_clients")
    .insert({
      full_name,
      rut: rutRaw ? cleanRut(rutRaw) : null,
      phone: text(fd, "phone"),
      email: text(fd, "email"),
      procedure_type: procedure,
      tribunal: text(fd, "tribunal"),
      rol: text(fd, "rol"),
      intake_date: intake,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/clientes");
  return { id: data.id as string };
}

/* ---------------- Pasos de la causa ---------------- */

/**
 * Marca un paso como hecho (fecha, nota y, según el paso, el liquidador). Como avanzar de paso es un movimiento
 * de la causa, deja también la revisión registrada (con movimiento, próxima revisión por defecto) para que la
 * causa no vuelva a la cola de «Por revisar» por algo que ya se vio.
 */
export async function completeStep(id: string, fd: FormData): Promise<Result> {
  const { supabase, user, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar la causa." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const step = text(fd, "step") ?? "";
  const note = text(fd, "note");
  const r = await applyStep(supabase, id, stepInputFromForm(fd, step, text(fd, "completed_at") ?? new Date().toISOString().slice(0, 10), note, text(fd, "liquidator_name")));
  if (r.error) return r;
  const rev = await supabase
    .from("legal_reviews")
    .insert({ client_id: id, reviewed_by: user.id, had_movement: true, note: note ? `${step}: ${note}` : `Paso completado: ${step}`, next_review_at: nextReviewAt(await cadenceDays(supabase, id)) });
  if (rev.error) return { error: rev.error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  revalidatePath("/revision");
  return {};
}

/** Deshace un paso marcado por error. */
export async function undoStep(id: string, step: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar la causa." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const { client, done } = await stepContext(supabase, id);
  if (!client) return { error: "Cliente no encontrado." };
  const del = await supabase.from("legal_case_steps").delete().eq("client_id", id).eq("step", step);
  if (del.error) return { error: del.error.message };
  const patch: Record<string, unknown> = { current_step: currentStep(client.procedure_type, done.filter((s) => s !== step)) };
  if (step === STEP_RESOLUTION) patch.liquidation_resolution_at = null;
  const upd = await supabase.from("legal_clients").update(patch).eq("id", id);
  if (upd.error) return { error: upd.error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

/* ---------------- Tareas: apercibimientos, audiencias y otras ---------------- */

/** Crea una tarea con vencimiento (un apercibimiento, una audiencia o cualquier gestión con fecha). */
export async function addTask(id: string, fd: FormData): Promise<Result> {
  const { supabase, can, tz } = await getContext();
  if (!can("legal.tasks")) return { error: "No tienes permiso para crear tareas." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const kind = text(fd, "kind") ?? "otra";
  if (!(kind in TASK_KINDS)) return { error: "Tipo de tarea no reconocido." };
  const title = text(fd, "title");
  if (!title) return { error: "Indica de qué se trata." };
  const local = text(fd, "due_at");
  const due = local ? zonedToIso(local, tz) : null;
  if (local && !due) return { error: "La fecha de vencimiento no es válida." };
  if (kind === "apercibimiento" && !due) return { error: "Un apercibimiento necesita fecha de vencimiento." };
  const { error } = await supabase.from("legal_tasks").insert({ client_id: id, kind, title, due_at: due, description: text(fd, "description") });
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

/** Edita una tarea pendiente en el sitio (tipo, título, plazo y detalle); las cerradas no se tocan. */
export async function updateTask(taskId: string, clientId: string, fd: FormData): Promise<Result> {
  const { supabase, can, tz } = await getContext();
  if (!can("legal.tasks")) return { error: "No tienes permiso para editar tareas." };
  if (!isUuid(taskId) || !isUuid(clientId)) return { error: "Datos no válidos." };
  const kind = text(fd, "kind") ?? "otra";
  if (!(kind in TASK_KINDS)) return { error: "Tipo de tarea no reconocido." };
  const title = text(fd, "title");
  if (!title) return { error: "Indica de qué se trata." };
  const local = text(fd, "due_at");
  const due = local ? zonedToIso(local, tz) : null;
  if (local && !due) return { error: "La fecha de vencimiento no es válida." };
  if (kind === "apercibimiento" && !due) return { error: "Un apercibimiento necesita fecha de vencimiento." };
  const { data, error } = await supabase.from("legal_tasks").update({ kind, title, due_at: due, description: text(fd, "description") }).eq("id", taskId).eq("client_id", clientId).eq("status", "pendiente").select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "La tarea ya no está pendiente." };
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/revision");
  revalidatePath("/revision/tareas");
  return {};
}

/**
 * Completa o cancela una tarea. Pide siempre un resultado corto (o el motivo) y guarda quién la cerró: el trigger
 * deja la entrada en el historial de la causa para supervisión. Solo se cierran tareas pendientes.
 */
export async function finishTask(taskId: string, clientId: string, status: "completada" | "cancelada", result?: string): Promise<Result> {
  const { supabase, user, can } = await getContext();
  if (!can("legal.tasks")) return { error: "No tienes permiso para gestionar tareas." };
  if (!isUuid(taskId) || !isUuid(clientId)) return { error: "Datos no válidos." };
  const text = (result ?? "").trim().slice(0, 300);
  if (text.length < 3) return { error: status === "completada" ? "Anota el resultado de la tarea en pocas palabras." : "Indica por qué se cancela la tarea." };
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("legal_tasks")
    .update({ status, result: text, closed_by: user.id, completed_at: status === "completada" ? now : null, canceled_at: status === "cancelada" ? now : null })
    .eq("id", taskId)
    .eq("client_id", clientId)
    .eq("status", "pendiente");
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
  revalidatePath("/revision");
  revalidatePath("/revision/tareas");
  return {};
}

/* ---------------- Cierre de la causa ---------------- */

/** Cierra la causa con motivo (dejó de pagar, se perdió el contacto…). Queda en «Cerradas» con su historial. */
export async function closeCase(id: string, fd: FormData): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para cerrar causas." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const reason = text(fd, "reason");
  if (!reason || !(CLOSE_REASONS as readonly string[]).includes(reason)) return { error: "Elige un motivo de cierre." };
  const detail = text(fd, "detail");
  if (reason === "Otro" && !detail) return { error: "Describe el motivo." };
  const { error } = await supabase.from("legal_clients").update({ archived_at: new Date().toISOString(), close_reason: reason, close_detail: detail }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

/** Reabre una causa cerrada por error. */
export async function reopenCase(id: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para reabrir causas." };
  if (!isUuid(id)) return { error: "Cliente no válido." };
  const { error } = await supabase.from("legal_clients").update({ archived_at: null, close_reason: null, close_detail: null }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return {};
}

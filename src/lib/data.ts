import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "./supabase/server";
import type { Permission } from "./permissions";
import type { Profile } from "./types";

/**
 * Usuario, perfil y permisos. Misma base y misma matriz de permisos que el CRM
 * (tabla role_permissions, leída con my_permissions()); nada viene del cliente.
 */
export async function getContext() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
  ]);
  const p = (profile ?? { id: user.id, full_name: user.email?.split("@")[0] ?? "", email: user.email ?? "", role: "ejecutivo", active: false, timezone: "America/Santiago" }) as Profile;
  const permissions = new Set<Permission>(((perms ?? []) as Permission[]).filter(Boolean));
  const can = (x: Permission) => p.active && permissions.has(x);
  return { supabase, user, profile: p, tz: p.timezone || "America/Santiago", permissions: Array.from(permissions), can };
}

export type Context = Awaited<ReturnType<typeof getContext>>;

/** Exige un permiso del área jurídica; sin él, pantalla de «sin acceso». */
export async function requirePermission(x: Permission) {
  const ctx = await getContext();
  if (!ctx.can(x)) redirect("/sin-acceso");
  return ctx;
}

export type LegalClient = {
  id: string;
  internal_number: string | null;
  full_name: string;
  rut: string | null;
  phone: string | null;
  email: string | null;
  procedure_type: string | null;
  tribunal: string | null;
  rol: string | null;
  caratula: string | null;
  intake_date: string | null;
  /** Solo indica si hay Clave Única guardada; el valor vive cifrado en la bóveda */
  clave_unica_secret_id: string | null;
  drive_folder_url: string | null;
  pjud_url: string | null;
  close_reason: string | null;
  close_detail: string | null;
  liquidator_name: string | null;
  liquidation_resolution_at: string | null;
  current_step: string | null;
  status_id: string | null;
  lawyer_id: string | null;
  lead_id: string | null;
  last_review_at: string | null;
  next_review_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LegalStatus = { id: string; name: string; position: number; active: boolean; is_terminal: boolean };

export type DocCategory = { id: string; name: string; position: number };

export type ChecklistItem = {
  id: string;
  client_id: string;
  label: string;
  satisfied: boolean;
  not_applicable: boolean;
  document_id: string | null;
  category_id: string | null;
  position: number;
};

export type LegalDocument = {
  id: string;
  client_id: string;
  category_id: string | null;
  checklist_item_id: string | null;
  name: string;
  doc_type: string | null;
  doc_date: string | null;
  status: "pendiente" | "recibido" | "preparado" | "firmado" | "presentado" | "reemplazado";
  notes: string | null;
  version: number;
  is_current: boolean;
  replaces_id: string | null;
  storage_path: string | null;
  drive_file_id: string | null;
  drive_link: string | null;
  file_size: number | null;
  mime: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type CaseStep = { id: string; client_id: string; step: string; completed_at: string; completed_by: string | null; note: string | null };

export type LegalTask = {
  id: string;
  client_id: string;
  assignee_id: string | null;
  kind: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "pendiente" | "completada" | "cancelada";
  result: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  /** Quién la completó o canceló (registro para supervisión). */
  closed_by: string | null;
  created_at: string;
};

export async function getStatuses(supabase: SupabaseClient): Promise<LegalStatus[]> {
  const { data } = await supabase.from("legal_statuses").select("*").eq("active", true).order("position");
  return (data ?? []) as LegalStatus[];
}

export async function getMembers(supabase: SupabaseClient) {
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, active").order("full_name");
  return (data ?? []) as { id: string; full_name: string; email: string; role: string; active: boolean }[];
}

export type LegalReview = {
  id: string;
  client_id: string;
  reviewed_at: string;
  reviewed_by: string | null;
  reviewer_name: string | null;
  had_movement: boolean;
  note: string | null;
  next_review_at: string | null;
  task_id: string | null;
};

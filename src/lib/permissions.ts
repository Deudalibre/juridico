// Roles y permisos del CRM.
//
// La matriz rol → permisos vive en la base de datos (tabla role_permissions, migración 0006)
// y es la única fuente de verdad: la aplican las políticas RLS, los RPC y los triggers.
// El servidor la lee con my_permissions() en cada petición; aquí solo están los nombres,
// para que el código tenga autocompletado y no invente permisos que no existen.

export type Role = "administrador" | "coordinador" | "ejecutivo" | "juridico";

export const ROLES: Role[] = ["administrador", "coordinador", "ejecutivo", "juridico"];

export const ROLE_LABEL: Record<Role, string> = {
  administrador: "Administrador",
  coordinador: "Coordinador",
  ejecutivo: "Ejecutivo",
  juridico: "Jurídico",
};

export type Permission =
  | "leads.view_assigned"
  | "leads.view_all"
  | "leads.create"
  | "leads.assign"
  | "leads.reassign"
  | "leads.merge"
  | "leads.reactivate"
  | "activities.record_for_others"
  | "tasks.create_own"
  | "tasks.create_for_team"
  | "supervision.view"
  | "recovery.view"
  | "workflows.manage"
  | "channels.manage"
  | "users.manage"
  | "settings.manage"
  | "integrations.manage"
  | "audit.view"
  | "pipelines.view"
  | "pipelines.manage"
  | "pipelines.create"
  | "pipelines.edit"
  | "pipelines.delete"
  // Área jurídica (migración 0009): separada del CRM comercial
  | "legal.view"
  | "legal.create"
  | "legal.edit"
  | "legal.assign"
  | "legal.tasks"
  | "legal.settings"
  | "documents.view"
  | "documents.upload"
  | "documents.edit"
  | "documents.manage";

export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role);

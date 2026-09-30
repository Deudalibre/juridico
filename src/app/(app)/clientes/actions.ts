"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { cleanRut, isValidRut } from "@/lib/rut";
import { isProcedure } from "@/lib/legal";

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

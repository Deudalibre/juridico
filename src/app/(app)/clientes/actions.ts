"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { cleanRut, isValidRut } from "@/lib/rut";

type Result = { error?: string };

/** Antecedentes básicos del cliente (el resto de la ficha llega con el mapa de plantillas). */
export async function saveClientBasics(id: string, fd: FormData): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  const s = (k: string) => String(fd.get(k) ?? "").trim() || null;
  const full_name = s("full_name");
  if (!full_name) return { error: "Indica el nombre completo." };
  const rutRaw = s("rut");
  // Control formal (formato y dígito verificador), no verificación de identidad
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT no tiene un formato o dígito verificador válido." };
  const { error } = await supabase
    .from("legal_clients")
    .update({
      full_name,
      rut: rutRaw ? cleanRut(rutRaw) : null,
      phone: s("phone"),
      email: s("email"),
      procedure_type: s("procedure_type"),
      tribunal: s("tribunal"),
      rol: s("rol"),
      caratula: s("caratula"),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/clientes/${id}`);
  return {};
}

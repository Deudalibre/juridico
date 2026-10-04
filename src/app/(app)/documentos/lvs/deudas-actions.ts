"use server";

import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/data";
import { CALIDADES, NATURALEZAS, type CalidadDeuda, type NaturalezaDeuda } from "@/lib/lvs-acreedores";
import { cleanRut, isValidRut } from "@/lib/rut";

type Result = { error?: string };
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const text = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max) || null;

/** Crea o edita una deuda del expediente (Anexo 9). Si viene de un acreedor del catálogo, lo deja enlazado. */
export async function saveDeuda(clientId: string, id: string | null, fd: FormData): Promise<Result & { id?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId) || (id && !isUuid(id))) return { error: "Datos no válidos." };
  const nombre = text(fd, "nombre");
  if (!nombre) return { error: "Indica el acreedor." };
  const rutRaw = text(fd, "rut", 20);
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT del acreedor no es válido." };
  const montoRaw = text(fd, "monto", 24)?.replace(/[^\d]/g, "") ?? "";
  const monto = montoRaw ? Number(montoRaw) : null;
  if (monto !== null && !(Number.isInteger(monto) && monto >= 0 && monto < 1e14)) return { error: "El monto no es válido." };
  const naturaleza = (text(fd, "naturaleza", 20) ?? "Valista") as NaturalezaDeuda;
  if (!NATURALEZAS.includes(naturaleza)) return { error: "Naturaleza no válida (Valista, Preferente o Privilegiado)." };
  const calidad = (text(fd, "calidad", 20) ?? "Deudor principal") as CalidadDeuda;
  if (!CALIDADES.includes(calidad)) return { error: "Calidad no válida." };
  const acreedorId = text(fd, "acreedor_id", 36);
  const email = text(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El correo del acreedor no es válido." };
  const row = {
    acreedor_id: acreedorId && isUuid(acreedorId) ? acreedorId : null,
    nombre,
    rut: rutRaw ? cleanRut(rutRaw) : null,
    email,
    telefono: text(fd, "telefono", 60),
    monto,
    naturaleza,
    origen_credito: text(fd, "origen_credito", 300),
    cmf: fd.get("cmf") !== "no",
    calidad,
    observaciones: text(fd, "observaciones", 500),
  };
  let savedId = id;
  if (id) {
    const { error } = await supabase.from("legal_lvs_deudas").update(row).eq("id", id).eq("client_id", clientId);
    if (error) return { error: error.message };
  } else {
    const { count } = await supabase.from("legal_lvs_deudas").select("id", { count: "exact", head: true }).eq("client_id", clientId);
    const { data, error } = await supabase.from("legal_lvs_deudas").insert({ ...row, client_id: clientId, orden: (count ?? 0) + 1 }).select("id").single();
    if (error) return { error: error.message };
    savedId = data.id as string;
  }
  revalidatePath(`/documentos/lvs/${clientId}`);
  return { id: savedId ?? undefined };
}

export async function deleteDeuda(clientId: string, id: string): Promise<Result> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar expedientes." };
  if (!isUuid(clientId) || !isUuid(id)) return { error: "Datos no válidos." };
  const { error } = await supabase.from("legal_lvs_deudas").delete().eq("id", id).eq("client_id", clientId);
  if (error) return { error: error.message };
  revalidatePath(`/documentos/lvs/${clientId}`);
  return {};
}

/** Acreedor que no estaba en el catálogo: se agrega una vez y queda para los demás clientes. */
export async function crearAcreedor(input: { nombre: string; rut?: string | null; email?: string | null; telefono?: string | null }): Promise<Result & { id?: string }> {
  const { supabase, can } = await getContext();
  if (!can("legal.edit")) return { error: "No tienes permiso para editar el catálogo." };
  const nombre = input.nombre.trim().slice(0, 160);
  if (!nombre) return { error: "Indica el nombre del acreedor." };
  const rutRaw = input.rut?.trim() ?? "";
  if (rutRaw && !isValidRut(rutRaw)) return { error: "El RUT del acreedor no es válido." };
  const rut = rutRaw ? cleanRut(rutRaw) : null;
  if (rut) {
    const { data: ya } = await supabase.from("legal_acreedores").select("id").eq("rut", rut).maybeSingle();
    if (ya) return { id: ya.id as string };
  }
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "El correo no es válido." };
  const { data, error } = await supabase.from("legal_acreedores").insert({ nombre, rut, email, telefono: input.telefono?.trim() || null, origen: "manual" }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath("/documentos/lvs");
  return { id: data.id as string };
}

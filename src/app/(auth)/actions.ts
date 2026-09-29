"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Jurídico no tiene inicio de sesión propio: se entra ya autenticado desde el CRM
// (misma cookie de sesión en *.deudalibre.cl). Al salir, se vuelve al login del CRM.
const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`${CRM_URL}/login`);
}

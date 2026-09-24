"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/types";

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "Email o contraseña incorrectos.",
  "Email not confirmed": "Confirma tu email antes de entrar (revisa tu bandeja de entrada).",
};
const translate = (msg: string) => AUTH_ERRORS[msg] ?? msg;

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const errors: Record<string, string> = {};
  if (!email) errors.email = "Indica tu email.";
  if (!password) errors.password = "Indica tu contraseña.";
  if (Object.keys(errors).length) return { errors };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { message: translate(error.message) };
  await supabase.rpc("log_login"); // auditoría compartida con el CRM
  redirect("/");
}

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFormState } from "react-dom";
import { signIn } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/ui";

// Misma cuenta que el CRM (mismo Supabase): aquí solo se inicia sesión; las cuentas se crean por invitación desde el CRM.
function LoginForm() {
  const [state, action] = useFormState(signIn, undefined);
  const params = useSearchParams();
  const linkError = params.get("error") === "confirmacion" ? "El enlace de confirmación no es válido o ha caducado." : undefined;

  return (
    <form action={action} className="card flex flex-col gap-5 p-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title text-[22px]">Iniciar sesión</h1>
        <span className="page-subtitle">Usa la misma cuenta del CRM.</span>
      </div>
      <FormMessage message={state?.message ?? linkError} />
      <Field label="Email" error={state?.errors?.email}>
        <input name="email" type="email" autoComplete="email" className="input" placeholder="tu@deudalibre.cl" />
      </Field>
      <Field label="Contraseña" error={state?.errors?.password}>
        <input name="password" type="password" autoComplete="current-password" className="input" />
      </Field>
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createLegalClient } from "../actions";
import { Field, toast } from "@/components/ui";
import { PROCEDURES } from "@/lib/legal";

export function NuevoForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const submit = (fd: FormData) =>
    start(async () => {
      const r = await createLegalClient(fd);
      if (r.error || !r.id) toast(r.error ?? "No se pudo crear el cliente", true);
      else {
        toast("Cliente creado");
        router.push(`/clientes/${r.id}`);
      }
    });

  return (
    <form action={submit} className="panel gap-5 px-5 py-5">
      <fieldset disabled={pending} className="contents">
        <div className="grid-fields">
          <Field label="Nombre completo">
            <input name="full_name" className="input" required autoComplete="off" />
          </Field>
          <Field label="RUT">
            <input name="rut" className="input tabnum" placeholder="12.345.678-5" autoComplete="off" />
          </Field>
          <Field label="Teléfono">
            <input name="phone" className="input tabnum" placeholder="+56 9 1234 5678" autoComplete="off" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className="input" autoComplete="off" />
          </Field>
          <Field label="Procedimiento">
            <select name="procedure_type" className="input" defaultValue="">
              <option value="">Sin definir</option>
              {PROCEDURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha de ingreso">
            <input name="intake_date" type="date" className="input tabnum" />
          </Field>
          <Field label="Causa rol">
            <input name="rol" className="input tabnum" placeholder="C-1234-2026" autoComplete="off" />
          </Field>
          <Field label="Tribunal">
            <input name="tribunal" className="input" autoComplete="off" />
          </Field>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary">{pending ? "Creando…" : "Crear cliente"}</button>
        </div>
      </fieldset>
    </form>
  );
}

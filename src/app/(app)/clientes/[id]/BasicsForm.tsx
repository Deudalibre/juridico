"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { saveClientBasics } from "../actions";
import { Field, toast } from "@/components/ui";
import { formatRut } from "@/lib/rut";
import { PROCEDURES } from "@/lib/legal";
import type { LegalClient } from "@/lib/data";

/** Datos personales y de la causa: una sola fuente para todos los documentos. */
export function BasicsForm({ client: c, canEdit }: { client: LegalClient; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fd: FormData) =>
    start(async () => {
      const r = await saveClientBasics(c.id, fd);
      if (r.error) toast(r.error, true);
      else {
        toast("Ficha guardada");
        router.refresh();
      }
    });

  return (
    <form action={save} className="panel gap-5 px-5 py-5">
      <div className="flex flex-col gap-1">
        <span className="card-title">Datos del cliente</span>
        <span className="text-[12.5px] text-muted">Corregir aquí el nombre o el RUT se refleja en las próximas generaciones de documentos.</span>
      </div>
      <fieldset disabled={!canEdit || pending} className="contents">
        <div className="grid-fields">
          <Field label="Nombre completo">
            <input name="full_name" className="input" defaultValue={c.full_name} autoComplete="off" />
          </Field>
          <Field label="RUT">
            <input name="rut" className="input tabnum" defaultValue={formatRut(c.rut)} placeholder="12.345.678-5" autoComplete="off" />
          </Field>
          <Field label="Teléfono">
            <input name="phone" className="input tabnum" defaultValue={c.phone ?? ""} placeholder="+56 9 1234 5678" autoComplete="off" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className="input" defaultValue={c.email ?? ""} autoComplete="off" />
          </Field>
        </div>

        <div className="flex flex-col gap-1">
          <span className="card-title">Causa</span>
          <span className="text-[12.5px] text-muted">Rol y tribunal quedan vacíos hasta que la causa se ingresa; la fecha de ingreso es la del tribunal o la Superintendencia.</span>
        </div>
        <div className="grid-fields">
          <Field label="Procedimiento">
            <select name="procedure_type" className="input" defaultValue={c.procedure_type ?? ""}>
              <option value="">Sin definir</option>
              {PROCEDURES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fecha de ingreso">
            <input name="intake_date" type="date" className="input tabnum" defaultValue={c.intake_date ?? ""} />
          </Field>
          <Field label="Causa rol">
            <input name="rol" className="input tabnum" defaultValue={c.rol ?? ""} placeholder="C-1234-2026" autoComplete="off" />
          </Field>
          <Field label="Tribunal">
            <input name="tribunal" className="input" defaultValue={c.tribunal ?? ""} placeholder="2º Juzgado Civil de Santiago" autoComplete="off" />
          </Field>
          <Field label="Carátula" className="sm:col-span-2">
            <input name="caratula" className="input" defaultValue={c.caratula ?? ""} autoComplete="off" />
          </Field>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <button className="btn-primary">{pending ? "Guardando…" : "Guardar ficha"}</button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

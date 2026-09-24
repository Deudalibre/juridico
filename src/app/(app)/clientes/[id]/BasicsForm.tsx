"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { saveClientBasics } from "../actions";
import { Field, toast } from "@/components/ui";
import { formatRut } from "@/lib/rut";
import type { LegalClient } from "@/lib/data";

type Client = LegalClient & { caratula: string | null };

export function BasicsForm({ client: c, canEdit }: { client: Client; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (fd: FormData) =>
    start(async () => {
      const r = await saveClientBasics(c.id, fd);
      if (r.error) toast(r.error, true);
      else {
        toast("Antecedentes guardados");
        router.refresh();
      }
    });

  return (
    <form action={save} className="panel gap-5 px-5 py-5">
      <div className="flex flex-col gap-1">
        <span className="card-title">Antecedentes personales y expediente</span>
        <span className="text-[12.5px] text-muted">
          Una sola fuente para todos los documentos: corregir aquí el nombre o el RUT se refleja en las próximas generaciones.
        </span>
      </div>
      <fieldset disabled={!canEdit || pending} className="contents">
        <div className="grid-fields">
          <Field label="Nombre completo">
            <input name="full_name" className="input" defaultValue={c.full_name} />
          </Field>
          <Field label="RUT">
            <input name="rut" className="input tabnum" defaultValue={formatRut(c.rut)} placeholder="12.345.678-5" />
          </Field>
          <Field label="Teléfono">
            <input name="phone" className="input" defaultValue={c.phone ?? ""} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className="input" defaultValue={c.email ?? ""} />
          </Field>
        </div>
        <span className="label">Expediente</span>
        <div className="grid-fields">
          <Field label="Procedimiento">
            <input name="procedure_type" className="input" defaultValue={c.procedure_type ?? ""} placeholder="Renegociación · Liquidación…" />
          </Field>
          <Field label="Tribunal">
            <input name="tribunal" className="input" defaultValue={c.tribunal ?? ""} />
          </Field>
          <Field label="Rol de causa (si ya existe)">
            <input name="rol" className="input" defaultValue={c.rol ?? ""} />
          </Field>
          <Field label="Carátula">
            <input name="caratula" className="input" defaultValue={c.caratula ?? ""} />
          </Field>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <button className="btn-primary">{pending ? "Guardando…" : "Guardar antecedentes"}</button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

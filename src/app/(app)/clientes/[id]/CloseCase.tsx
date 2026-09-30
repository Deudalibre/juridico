"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { closeCase, reopenCase } from "../actions";
import { Field, toast } from "@/components/ui";
import { CLOSE_REASONS } from "@/lib/legal";

/** Botón «Cerrar causa» de la cabecera: pide motivo y detalle antes de archivar. Si está cerrada, ofrece reabrir. */
export function CloseCase({ clientId, closed, reason, detail, canEdit }: { clientId: string; closed: boolean; reason: string | null; detail: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<string>(CLOSE_REASONS[0]);

  if (!canEdit) return null;

  if (closed)
    return (
      <button
        className="btn-outline btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reopenCase(clientId);
            if (r.error) toast(r.error, true);
            else {
              toast("Causa reabierta");
              router.refresh();
            }
          })
        }
        title={[reason, detail].filter(Boolean).join(" · ")}
      >
        {pending ? "Reabriendo…" : "Reabrir causa"}
      </button>
    );

  const submit = (fd: FormData) =>
    start(async () => {
      const r = await closeCase(clientId, fd);
      if (r.error) toast(r.error, true);
      else {
        toast("Causa cerrada");
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="relative z-20">
      <button className="btn-ghost btn-sm text-danger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Cerrar causa
      </button>
      {open && (
        <form action={submit} className="popover fade-in !w-80 right-0 flex flex-col gap-3 p-4">
          <span className="card-title">Cerrar esta causa</span>
          <span className="text-[12.5px] text-muted">Queda en «Cerradas» con su historial; se puede reabrir.</span>
          <Field label="Motivo">
            <select name="reason" className="input" value={chosen} onChange={(e) => setChosen(e.target.value)} disabled={pending}>
              {CLOSE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label={chosen === "Otro" ? "Describe el motivo" : "Detalle (opcional)"}>
            <textarea name="detail" className="input min-h-[64px]" disabled={pending} placeholder={chosen === "Dejó de pagar" ? "Última cuota pagada, monto pendiente…" : ""} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </button>
            <button className="btn-danger btn-sm" disabled={pending}>
              {pending ? "Cerrando…" : "Cerrar causa"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

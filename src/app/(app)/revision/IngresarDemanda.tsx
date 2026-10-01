"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completeStep } from "@/app/(app)/clientes/actions";
import { Modal } from "@/components/ui/Dialog";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { STEP_DOCS, STEP_FILING } from "@/lib/legal";
import { uploadCaseFile } from "@/lib/upload-client";

type Props = { client: { id: string; full_name: string; rol: string | null; tribunal: string | null; intake_date: string | null }; canEdit: boolean };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Para un cliente en preparación (sin rol): registrar el ingreso de la demanda desde la propia cola, con el
 * certificado de envío, el rol, el tribunal y la fecha. Es el mismo paso «Ingreso de demanda» de la pestaña Causa.
 */
export function IngresarDemanda({ client, canEdit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [rol, setRol] = useState(client.rol ?? "");
  const [tribunal, setTribunal] = useState(client.tribunal ?? "");
  const [date, setDate] = useState(client.intake_date ?? today());
  const [note, setNote] = useState("");
  const spec = STEP_DOCS[STEP_FILING];

  const save = () => {
    if (!file) return toast(`Adjunta el ${spec.label}: es lo que acredita el ingreso.`, true);
    if (!rol.trim() || !tribunal.trim()) return toast("Indica el rol y el tribunal que aparecen en el certificado.", true);
    start(async () => {
      try {
        const up = await uploadCaseFile(client.id, file);
        const fd = new FormData();
        fd.set("step", STEP_FILING);
        fd.set("completed_at", date);
        fd.set("intake_date", date);
        fd.set("rol", rol.trim());
        fd.set("tribunal", tribunal.trim());
        fd.set("note", note.trim());
        fd.set("doc_path", up.path);
        fd.set("doc_size", String(up.size));
        fd.set("doc_mime", up.mime);
        fd.set("doc_name", up.fileName);
        const r = await completeStep(client.id, fd);
        if (r.error) toast(r.error, true);
        else {
          toast(`Demanda ingresada · ${client.full_name} pasa a ${date.slice(0, 4)}`);
          setOpen(false);
          router.refresh();
        }
      } catch (e) {
        toast((e as Error).message, true);
      }
    });
  };

  if (!canEdit) return null;
  return (
    <>
      <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        <Icon name="plus" size={13} /> Ingresar demanda
      </button>
      {open && (
        <Modal title={`Ingresar demanda · ${client.full_name}`} subtitle="Con el certificado de envío la causa pasa a tramitación y entra a la revisión de su año y mes." onClose={onClose(pending, setOpen)} busy={pending} wide>
          <div className="flex flex-col gap-4">
            <Field label={spec.label}>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="input !py-1.5 text-[12.5px] file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-[12px]"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={pending}
              />
              <span className="mt-1 block text-[12px] text-muted">{spec.hint}</span>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rol de la causa">
                <input className="input tabnum" value={rol} onChange={(e) => setRol(e.target.value)} placeholder="C-1234-2026" maxLength={40} disabled={pending} autoFocus />
              </Field>
              <Field label="Fecha de ingreso">
                <input type="date" className="input tabnum" value={date} onChange={(e) => setDate(e.target.value)} disabled={pending} />
              </Field>
              <Field label="Tribunal" className="sm:col-span-2">
                <input className="input" value={tribunal} onChange={(e) => setTribunal(e.target.value)} placeholder="1º Juzgado Civil de Santiago" maxLength={120} disabled={pending} />
              </Field>
              <Field label="Nota (opcional)" className="sm:col-span-2">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={pending} />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={save} disabled={pending}>
                {pending ? "Guardando…" : "Registrar ingreso"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

const onClose = (pending: boolean, setOpen: (v: boolean) => void) => () => !pending && setOpen(false);

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveClientLinks } from "../actions";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Props = { clientId: string; driveUrl: string | null; pjudUrl: string | null; canEdit: boolean };

/**
 * Enlaces externos del cliente. Hoy se pegan a mano; más adelante «Carpeta del cliente» se
 * conectará al Drive del estudio y «Ficha jurídica» traerá la causa desde el Poder Judicial.
 */
export function LinksCard({ clientId, driveUrl, pjudUrl, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const save = (fd: FormData) =>
    start(async () => {
      const r = await saveClientLinks(clientId, fd);
      if (r.error) toast(r.error, true);
      else {
        toast("Enlaces guardados");
        setEditing(false);
        router.refresh();
      }
    });

  if (editing)
    return (
      <form action={save} className="flex flex-col gap-3">
        <Field label="Carpeta del cliente (Drive)">
          <input name="drive_folder_url" type="url" className="input" defaultValue={driveUrl ?? ""} placeholder="https://drive.google.com/…" disabled={pending} />
        </Field>
        <Field label="Ficha jurídica (Poder Judicial)">
          <input name="pjud_url" type="url" className="input" defaultValue={pjudUrl ?? ""} placeholder="https://oficinajudicialvirtual.pjud.cl/…" disabled={pending} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={pending}>
            Cancelar
          </button>
          <button className="btn-primary btn-sm" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    );

  return (
    <div className="flex flex-col gap-2">
      <LinkLine icon="folder" label="Carpeta del cliente" url={driveUrl} />
      <LinkLine icon="external" label="Ficha jurídica" url={pjudUrl} />
      {canEdit && (
        <button className="btn-ghost btn-sm self-start" onClick={() => setEditing(true)}>
          <Icon name="edit" size={13} /> {driveUrl || pjudUrl ? "Editar enlaces" : "Agregar enlaces"}
        </button>
      )}
      <span className="text-[11.5px] text-faint">Pronto se conectarán solos: la carpeta desde el Drive del estudio y la ficha desde el Poder Judicial.</span>
    </div>
  );
}

function LinkLine({ icon, label, url }: { icon: string; label: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline">
      <Icon name={icon} size={14} /> {label}
    </a>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[13.5px] text-faint">
      <Icon name={icon} size={14} /> {label} · sin enlace
    </span>
  );
}

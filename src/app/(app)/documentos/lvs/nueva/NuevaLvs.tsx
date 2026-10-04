"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createLvs, createLvsClient } from "../actions";

type Candidate = { id: string; internal_number: string | null; full_name: string; rut: string | null; rutLabel: string | null; procedure_type: string | null; hasLvs: boolean };

export function NuevaLvs({ q, candidates }: { q: string; candidates: Candidate[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const open = (clientId: string) => {
    setBusy(clientId);
    start(async () => {
      const r = await createLvs(clientId);
      if (r.error || !r.id) {
        toast(r.error ?? "No se pudo abrir el expediente", true);
        setBusy(null);
      } else router.push(`/documentos/lvs/${r.id}`);
    });
  };
  const create = (fd: FormData) =>
    start(async () => {
      const r = await createLvsClient(fd);
      if (r.error || !r.id) toast(r.error ?? "No se pudo crear el cliente", true);
      else {
        toast("Expediente LVS abierto");
        router.push(`/documentos/lvs/${r.id}`);
      }
    });

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="panel overflow-hidden">
        <div className="panel-head !py-3">
          <span className="card-title">Cliente existente</span>
          <form className="relative ml-auto" role="search">
            <input name="q" defaultValue={q} className="search" placeholder="Nombre o RUT…" aria-label="Buscar cliente" autoComplete="off" autoFocus />
          </form>
        </div>
        {candidates.length === 0 ? (
          <div className="px-5 py-8 text-center text-[12.5px] text-faint">{q ? "Ningún cliente coincide. Puedes darlo de alta a la derecha." : "No hay clientes todavía."}</div>
        ) : (
          <>
            {!q && <div className="border-b border-line-soft px-4 py-2 text-[11.5px] text-muted">Últimos clientes editados. Escribe arriba para buscar entre todos.</div>}
            {candidates.map((c) => (
              <div key={c.id} className="row flex min-h-[48px] items-center gap-3 px-4 py-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-semibold text-fg">
                    {c.internal_number ? <span className="tabnum text-muted">{c.internal_number} · </span> : null}
                    {c.full_name}
                  </span>
                  <span className="text-[11.5px] text-muted">
                    <span className="tabnum">{c.rutLabel ?? "RUT pendiente"}</span>
                    {c.procedure_type ? ` · ${c.procedure_type}` : ""}
                  </span>
                </span>
                {c.hasLvs ? (
                  <Link href={`/documentos/lvs/${c.id}`} className="btn-secondary btn-sm">
                    Ya tiene expediente · abrir
                  </Link>
                ) : (
                  <button className="btn-primary btn-sm" disabled={pending} onClick={() => open(c.id)}>
                    {busy === c.id ? "Abriendo…" : "Abrir expediente"}
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </section>

      <form action={create} className="panel gap-4 px-5 py-5 self-start">
        <div className="flex items-center gap-2">
          <Icon name="plus" size={15} />
          <span className="card-title">Cliente nuevo</span>
        </div>
        <span className="text-[12.5px] text-muted">Solo lo mínimo para abrir el expediente. Lo demás se completa en la Ficha Maestra.</span>
        <fieldset disabled={pending} className="contents">
          <div className="flex flex-col gap-4">
            <Field label="Nombre completo">
              <input name="full_name" className="input" required autoComplete="off" />
            </Field>
            <div className="grid-fields">
              <Field label="RUT">
                <input name="rut" className="input tabnum" placeholder="12.345.678-5" autoComplete="off" />
              </Field>
              <Field label="Teléfono">
                <input name="phone" className="input tabnum" placeholder="+56 9 1234 5678" autoComplete="off" />
              </Field>
            </div>
            <Field label="Email">
              <input name="email" type="email" className="input" autoComplete="off" />
            </Field>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary">{pending ? "Creando…" : "Crear y abrir expediente"}</button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

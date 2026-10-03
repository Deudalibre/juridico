"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Field, toast } from "@/components/ui";
import { Modal } from "@/components/ui/Dialog";
import type { LvsFicha } from "@/lib/lvs";
import { CATEGORIAS, type BienCategoria, type BienField, type BienRow, type BienesPorCategoria } from "@/lib/lvs-bienes";
import { formatRut } from "@/lib/rut";
import { deleteBien, saveBien } from "../bienes-actions";

type Props = { clientId: string; ficha: LvsFicha; bienes: BienesPorCategoria; canEdit: boolean };

// Tailwind solo genera las clases que ve escritas: el ancho de cada campo sale de esta tabla, no de un texto armado
const SPAN: Record<number, string> = { 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5", 6: "sm:col-span-6", 7: "sm:col-span-7", 8: "sm:col-span-8", 9: "sm:col-span-9", 12: "sm:col-span-12" };

/**
 * Bienes del deudor (art. 273 A n.º 1): un panel por categoría marcada con «sí» en la ficha, con sus bienes en
 * lista y un formulario con las columnas exactas del anexo oficial. Cada vehículo o inmueble agrega su propio
 * documento de dominio en Documentación.
 */
export function BienesTab({ clientId, ficha, bienes, canEdit }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ cat: BienCategoria; row: BienRow | null } | null>(null);
  const activas = CATEGORIAS.filter((c) => ficha[c.pregunta] === true);
  const inactivas = CATEGORIAS.filter((c) => ficha[c.pregunta] !== true);

  const remove = (cat: BienCategoria, row: BienRow) => {
    if (!confirm(`¿Quitar este ${cat.singular} de la lista?`)) return;
    start(async () => {
      const r = await deleteBien(clientId, cat.key, row.id);
      if (r.error) toast(r.error, true);
      else {
        toast(`${cat.titulo}: quitado`);
        router.refresh();
      }
    });
  };

  return (
    <>
      {activas.length === 0 && (
        <section className="panel empty">
          <span className="icon-tile">
            <Icon name="grid" />
          </span>
          <span className="empty-title">La ficha no declara bienes</span>
          <span className="empty-text">
            Marca «Sí» en alguna categoría del bloque Patrimonio de la{" "}
            <Link href={`/documentos/lvs/${clientId}?tab=Ficha%20maestra`} className="text-accent">
              Ficha Maestra
            </Link>{" "}
            y aparecerá aquí su lista.
          </span>
        </section>
      )}
      {activas.map((cat) => {
        const rows = bienes[cat.key];
        return (
          <section key={cat.key} className="panel overflow-hidden">
            <div className="panel-head !py-3">
              <div className="flex min-w-0 flex-col">
                <span className="card-title">
                  {cat.titulo} <span className="text-faint">· Anexo N.º {cat.anexo}</span>
                </span>
                <span className="text-[12px] text-muted">
                  {rows.length === 0 ? `Sin ${cat.singular}s todavía` : `${rows.length} ${rows.length === 1 ? cat.singular : cat.singular + "s"}`}
                  {cat.requisito ? ` · cada ${cat.singular} exige su ${cat.requisito.codigo === "cav" ? "certificado de anotaciones vigentes" : "certificado de dominio vigente"}` : ""}
                </span>
              </div>
              {canEdit && (
                <button className="btn-primary btn-sm ml-auto" onClick={() => setEditing({ cat, row: null })} disabled={pending}>
                  + Agregar {cat.singular}
                </button>
              )}
            </div>
            {rows.length > 0 && (
              <div>
                {rows.map((row, i) => {
                  const s = cat.resumen(row);
                  return (
                    <div key={row.id} className="row flex min-h-[48px] items-center gap-3 px-4 py-2">
                      <span className="tabnum w-6 text-[12px] font-semibold text-muted">{i + 1}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-fg">{s.titulo}</span>
                          {row.excluido && <span className="tag warn shrink-0">Excluido</span>}
                          {(row.gravamen || row.hipoteca) && <span className="tag shrink-0">Con gravamen</span>}
                        </span>
                        {s.detalle && <span className="truncate text-[11.5px] text-muted">{s.detalle}</span>}
                      </span>
                      {canEdit && (
                        <span className="flex items-center gap-1">
                          <button className="btn-ghost btn-sm" onClick={() => setEditing({ cat, row })} disabled={pending}>
                            <Icon name="edit" size={13} /> Editar
                          </button>
                          <button className="btn-ghost btn-sm text-danger" onClick={() => remove(cat, row)} disabled={pending} aria-label={`Quitar ${cat.singular}`}>
                            <Icon name="trash" size={13} />
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
      {inactivas.length > 0 && activas.length > 0 && (
        <p className="px-1 text-[12px] text-muted">
          Sin lista porque la ficha dice «No» o está sin responder: {inactivas.map((c) => c.titulo.toLowerCase()).join(", ")}.
        </p>
      )}
      {editing && (
        <BienModal
          clientId={clientId}
          cat={editing.cat}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Formulario de un bien: los campos salen de la descripción de la categoría; los condicionales se muestran según la clase o el Sí/No. */
function BienModal({ clientId, cat, row, onClose, onSaved }: { clientId: string; cat: BienCategoria; row: BienRow | null; onClose: () => void; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const initial: Record<string, string> = {};
  for (const f of cat.fields) {
    const v = row?.[f.name];
    initial[f.name] = f.type === "bool" ? (v ? "si" : "no") : v == null ? (f.name === "clase" ? (f.options?.[0]?.key ?? "") : f.name === "moneda" ? "CLP" : "") : f.name === "rut" || f.name === "causante_rut" ? formatRut(String(v)) : String(v);
  }
  const [vals, setVals] = useState(initial);
  const set = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));
  const visible = (f: BienField) => !f.when || vals[f.when.field] === f.when.is;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    for (const f of cat.fields) if (visible(f)) fd.set(f.name, vals[f.name] ?? "");
    start(async () => {
      const r = await saveBien(clientId, cat.key, row?.id ?? null, fd);
      if (r.error) toast(r.error, true);
      else {
        toast(row ? "Bien actualizado" : `${cat.titulo}: agregado`);
        onSaved();
      }
    });
  };

  const control = (f: BienField) => {
    const common = { id: `b-${f.name}`, disabled: pending };
    if (f.type === "bool")
      return (
        <div className="seg" role="radiogroup" aria-label={f.label}>
          {(["si", "no"] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={vals[f.name] === v} aria-current={vals[f.name] === v ? "true" : undefined} onClick={() => set(f.name, v)} disabled={pending} className="min-w-[44px] justify-center">
              {v === "si" ? "Sí" : "No"}
            </button>
          ))}
        </div>
      );
    if (f.type === "select")
      return (
        <select {...common} className="input" value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)}>
          {f.name !== "clase" && f.name !== "moneda" && <option value="">Sin definir</option>}
          {f.options?.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      );
    if (f.type === "textarea") return <textarea {...common} className="input min-h-[72px] resize-y" value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)} />;
    return (
      <input
        {...common}
        type={f.type === "date" ? "date" : "text"}
        inputMode={f.type === "money" || f.type === "number" ? "numeric" : undefined}
        className={`input ${f.type === "money" || f.type === "number" || f.type === "date" ? "tabnum" : ""}`}
        value={vals[f.name]}
        placeholder={f.placeholder ?? (f.type === "money" ? "$" : undefined)}
        onChange={(e) => set(f.name, e.target.value)}
        autoComplete="off"
      />
    );
  };

  return (
    <Modal title={`${row ? "Editar" : "Agregar"} ${cat.singular}`} subtitle={`${cat.titulo} · columnas del Anexo N.º ${cat.anexo}`} onClose={onClose} busy={pending} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-12">
          {cat.fields.filter(visible).map((f) => (
            <Field key={f.name + (f.when?.is ?? "")} label={f.label} className={SPAN[f.span ?? 6] ?? "sm:col-span-6"}>
              {control(f)}
            </Field>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line-soft pt-3">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button className="btn-primary" disabled={pending}>
            {pending ? "Guardando…" : row ? "Guardar cambios" : `Agregar ${cat.singular}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

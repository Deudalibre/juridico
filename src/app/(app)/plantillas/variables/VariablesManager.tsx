"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { FICHA_FIELDS, VAR_TYPES, fieldLabel, slugName, type CatalogVariable, type VarType } from "@/lib/templates";
import { createVariable, deleteVariable, updateVariable } from "./actions";

type Props = {
  catalog: CatalogVariable[];
  /** Plantillas que usan cada variable (por nombre del marcador) */
  usage: Record<string, string[]>;
  canEdit: boolean;
  canManage: boolean;
};

type Form = { name: string; label: string; type: VarType; source: string; hint: string };
const empty = (): Form => ({ name: "", label: "", type: "texto", source: "", hint: "" });
const formOf = (v: CatalogVariable): Form => ({ name: v.name, label: v.label, type: v.type, source: v.source ?? "", hint: v.hint ?? "" });

const GRID = "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_0.8fr_minmax(0,1.3fr)_minmax(0,1.2fr)_150px] items-center gap-3";

/**
 * Catálogo del estudio: alta en línea arriba, tabla con edición por fila y, aparte, las variables automáticas
 * de la ficha (solo lectura). El nombre es el marcador que va en el Word, por eso no se edita una vez creado.
 */
export function VariablesManager({ catalog, usage, canEdit, canManage }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<Form>(empty());
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Form>(empty());
  const [confirm, setConfirm] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast(r.error, true);
      else {
        toast(done);
        after?.();
        router.refresh();
      }
    });

  // Al escribir la etiqueta se propone el nombre; si coincide con un campo de la ficha, la fuente se propone sola.
  // Actualizaciones funcionales: varios cambios seguidos no se pisan entre sí.
  type Set = Dispatch<SetStateAction<Form>>;
  const onLabel = (label: string, set: Set) =>
    set((f) => {
      const name = f.name && f.name !== slugName(f.label) ? f.name : slugName(label);
      const field = FICHA_FIELDS.find((x) => x.key === name);
      return { ...f, label, name, source: f.source || (field ? field.key : ""), type: field?.type ?? f.type };
    });

  const fields = (f: Form, set: Set, nameLocked: boolean) => (
    <>
      <input
        className="input font-mono text-[12.5px]"
        value={f.name}
        onChange={(e) => set((prev) => ({ ...prev, name: slugName(e.target.value) }))}
        placeholder="nombre_variable"
        aria-label="Nombre (marcador)"
        disabled={nameLocked}
        title={nameLocked ? "El nombre es el marcador escrito en los Word: no se cambia" : undefined}
      />
      <input className="input" value={f.label} onChange={(e) => onLabel(e.target.value, set)} placeholder="Etiqueta (cómo se pide)" aria-label="Etiqueta" maxLength={120} />
      <select className="input" value={f.type} onChange={(e) => set((prev) => ({ ...prev, type: e.target.value as VarType }))} aria-label="Tipo">
        {Object.entries(VAR_TYPES).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <select className="input" value={f.source} onChange={(e) => set((prev) => ({ ...prev, source: e.target.value }))} aria-label="Fuente">
        <option value="">Se pide al generar</option>
        {FICHA_FIELDS.map((x) => (
          <option key={x.key} value={x.key}>
            Ficha: {x.label}
          </option>
        ))}
      </select>
      <input className="input" value={f.hint} onChange={(e) => set((prev) => ({ ...prev, hint: e.target.value }))} placeholder="Pista o ejemplo (opcional)" aria-label="Pista" maxLength={240} />
    </>
  );

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="panel-head justify-between">
          <span className="card-title">Catálogo del estudio</span>
          <span className="text-[12.5px] text-muted">{catalog.length === 0 ? "Todavía vacío" : `${catalog.length} ${catalog.length === 1 ? "variable" : "variables"}`}</span>
        </div>

        {canEdit && (
          <form
            className="flex flex-col gap-2 border-b border-line-soft bg-surface-2 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name || !form.label.trim()) return toast("Indica el nombre y la etiqueta.", true);
              run(() => createVariable({ ...form, source: form.source || null, hint: form.hint || null }), `Variable {${form.name}} creada`, () => setForm(empty()));
            }}
          >
            <span className="th">Nueva variable</span>
            <div className={GRID}>
              {fields(form, setForm, false)}
              <button className="btn-primary btn-sm justify-self-end" type="submit" disabled={pending || !form.name}>
                <Icon name="plus" size={13} /> Añadir
              </button>
            </div>
          </form>
        )}

        {catalog.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="tag" />
            </span>
            <span className="empty-title">Aún no hay variables del estudio</span>
            <span className="empty-text">Escribe la etiqueta de un dato («Domicilio», «Comuna», «Estado civil»…) y el nombre del marcador se propone solo. Cuando subas un Word con ese marcador, se reconocerá al instante.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div role="table" aria-label="Variables del estudio" className="min-w-[980px]">
              <div className={`${GRID} th-band border-b border-line px-4 py-2.5`} role="row">
                {["Marcador", "Etiqueta", "Tipo", "Fuente", "Pista · uso", ""].map((h, i) => (
                  <div key={i} className="th" role="columnheader">
                    {h}
                  </div>
                ))}
              </div>
              {catalog.map((v) =>
                editing === v.name ? (
                  <form
                    key={v.name}
                    className={`${GRID} border-b border-line-soft bg-surface-2 px-4 py-2`}
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(() => updateVariable(v.name, { ...editForm, source: editForm.source || null, hint: editForm.hint || null }), `Variable {${v.name}} guardada`, () => setEditing(null));
                    }}
                  >
                    {fields(editForm, setEditForm, true)}
                    <div className="flex justify-end gap-1.5">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(null)} disabled={pending}>
                        Cancelar
                      </button>
                      <button type="submit" className="btn-primary btn-sm" disabled={pending}>
                        Guardar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div key={v.name} className={`${GRID} row min-h-[48px] cursor-default px-4 py-1.5`} role="row">
                    <code className="truncate rounded bg-[var(--tag-bg)] px-1.5 py-0.5 font-mono text-[12.5px] text-fg" role="cell">{`{${v.name}}`}</code>
                    <span className="truncate text-[13px] font-medium text-fg" role="cell">
                      {v.label}
                    </span>
                    <span className="text-[12.5px] text-soft" role="cell">
                      {VAR_TYPES[v.type]}
                    </span>
                    <span className="truncate text-[12.5px]" role="cell">
                      {v.source ? <span className="tag brand">Ficha · {fieldLabel(v.source)}</span> : <span className="text-muted">Se pide al generar</span>}
                    </span>
                    <span className="flex min-w-0 flex-col text-[12px] text-muted" role="cell">
                      {v.hint && <span className="truncate text-soft">{v.hint}</span>}
                      <span className="truncate text-faint" title={usage[v.name]?.join(", ")}>
                        {usage[v.name]?.length ? `En ${usage[v.name].length} ${usage[v.name].length === 1 ? "plantilla" : "plantillas"}` : "Sin usar todavía"}
                      </span>
                    </span>
                    <div className="flex items-center justify-end gap-1.5" role="cell">
                      {canEdit && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => {
                            setEditing(v.name);
                            setEditForm(formOf(v));
                            setConfirm(null);
                          }}
                        >
                          <Icon name="edit" size={13} /> Editar
                        </button>
                      )}
                      {canManage &&
                        (confirm === v.name ? (
                          <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => run(() => deleteVariable(v.name), `Variable {${v.name}} quitada`, () => setConfirm(null))}>
                            Confirmar
                          </button>
                        ) : (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(v.name)} title="Quitar del catálogo (las plantillas que la usan la conservan)">
                            <Icon name="trash" size={13} />
                          </button>
                        ))}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="panel-head justify-between">
          <span className="card-title">Automáticas de la ficha</span>
          <span className="text-[12.5px] text-muted">Se rellenan solas con los datos del cliente; no hace falta crearlas</span>
        </div>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {FICHA_FIELDS.map((f) => (
            <span key={f.key} className="tag" title={`${f.label} · ${VAR_TYPES[f.type]}`}>
              <code className="font-mono">{`{${f.key}}`}</code>
              <span className="text-muted">· {f.label}</span>
            </span>
          ))}
        </div>
      </section>
    </>
  );
}

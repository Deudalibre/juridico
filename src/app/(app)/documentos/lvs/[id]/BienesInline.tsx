"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Field, toast } from "@/components/ui";
import { Modal } from "@/components/ui/Dialog";
import { TIPOS_BIEN_MUEBLE, sugerirTipoMueble, type BienCategoria, type BienField, type BienRow } from "@/lib/lvs-bienes";
import { formatRut } from "@/lib/rut";
import { deleteBien, saveBien } from "../bienes-actions";

// Tailwind solo genera las clases que ve escritas: el ancho de cada campo sale de esta tabla, no de un texto armado
const SPAN: Record<number, string> = { 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5", 6: "sm:col-span-6", 7: "sm:col-span-7", 8: "sm:col-span-8", 9: "sm:col-span-9", 12: "sm:col-span-12" };

/**
 * Lista de una categoría (bienes de un anexo o juicios) dentro de la Ficha Maestra: se despliega bajo la pregunta
 * marcada con «Sí», con «Agregar», «Editar» y «Quitar». Vive dentro del formulario de la ficha, por eso todos sus
 * botones son type="button" y el formulario del modal no deja subir su envío al de la ficha.
 */
export function BienesInline({ clientId, cat, rows, canEdit }: { clientId: string; cat: BienCategoria; rows: BienRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ row: BienRow | null } | null>(null);
  // Carga rápida del Anexo 8: nombre + tipo (sugerido por el nombre); el resto va por defecto
  const [rapido, setRapido] = useState({ datos: "", tipo: "" as string, tocado: false });
  const rapidoTipo = rapido.tocado ? rapido.tipo : rapido.tipo || (sugerirTipoMueble(rapido.datos)?.toString() ?? "");

  const agregarRapido = () => {
    const datos = rapido.datos.trim();
    if (!datos) return;
    if (!rapidoTipo) return toast("Elige el tipo del Anexo 8 para este bien.", true);
    const fd = new FormData();
    fd.set("datos", datos);
    fd.set("tipo_codigo", rapidoTipo);
    start(async () => {
      const r = await saveBien(clientId, cat.key, null, fd);
      if (r.error) toast(r.error, true);
      else {
        setRapido({ datos: "", tipo: "", tocado: false });
        router.refresh();
      }
    });
  };

  const remove = (row: BienRow) => {
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
    <div className="rounded-lg border border-line-soft" style={{ background: "var(--band)" }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="text-[12px] font-semibold text-soft">
          {cat.titulo}
          {cat.anexo ? <span className="text-faint"> · Anexo N.º {cat.anexo}</span> : null}
        </span>
        <span className="text-[11.5px] text-muted">· {rows.length === 0 ? `sin ${cat.singular}s cargados` : `${rows.length} ${rows.length === 1 ? cat.singular : cat.singular + "s"}`}</span>
        {canEdit && (
          <button type="button" className="btn-outline btn-sm ml-auto" onClick={() => setEditing({ row: null })} disabled={pending}>
            + Agregar {cat.singular}
          </button>
        )}
      </div>
      {cat.key === "muebles" && canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-soft bg-surface px-3 py-2">
          <input
            className="input !min-h-[30px] min-w-[200px] flex-1 text-[12.5px]"
            placeholder="Escribe el bien y Enter: cafetera, notebook, plancha de pelo…"
            value={rapido.datos}
            disabled={pending}
            onChange={(e) => setRapido((s) => ({ ...s, datos: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregarRapido();
              }
            }}
            aria-label="Bien del Anexo 8"
          />
          <select className="input !min-h-[30px] w-[260px] text-[12.5px]" value={rapidoTipo} disabled={pending} onChange={(e) => setRapido((s) => ({ ...s, tipo: e.target.value, tocado: true }))} aria-label="Tipo del Anexo 8">
            <option value="">Tipo…</option>
            {Object.entries(TIPOS_BIEN_MUEBLE).map(([k, v]) => (
              <option key={k} value={k}>
                {k} — {v}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary btn-sm" disabled={pending || !rapido.datos.trim()} onClick={agregarRapido}>
            Agregar
          </button>
          <span className="w-full text-[11px] text-muted">Cantidad 1 · estado Regular · sin observaciones · dirección del domicilio. Para cambiar algo, «Editar».</span>
        </div>
      )}
      {rows.map((row, i) => {
        const s = cat.resumen(row);
        return (
          <div key={row.id} className="flex min-h-[40px] items-center gap-3 border-t border-line-soft bg-surface px-3 py-1.5">
            <span className="tabnum w-5 text-[12px] font-semibold text-muted">{i + 1}</span>
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
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing({ row })} disabled={pending}>
                  <Icon name="edit" size={13} /> Editar
                </button>
                <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => remove(row)} disabled={pending} aria-label={`Quitar ${cat.singular}`}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            )}
          </div>
        );
      })}
      {editing && (
        <BienModal
          clientId={clientId}
          cat={cat}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** Formulario de un elemento: los campos salen de la descripción de la categoría; los condicionales según la clase o el Sí/No. */
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
    e.stopPropagation(); // el modal vive (en el árbol de React) dentro del formulario de la ficha
    const fd = new FormData();
    for (const f of cat.fields) if (visible(f)) fd.set(f.name, vals[f.name] ?? "");
    start(async () => {
      const r = await saveBien(clientId, cat.key, row?.id ?? null, fd);
      if (r.error) toast(r.error, true);
      else {
        toast(row ? "Guardado" : `${cat.titulo}: agregado`);
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
    <Modal title={`${row ? "Editar" : "Agregar"} ${cat.singular}`} subtitle={cat.anexo ? `${cat.titulo} · columnas del Anexo N.º ${cat.anexo}` : cat.titulo} onClose={onClose} busy={pending} size="lg">
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
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Guardando…" : row ? "Guardar cambios" : `Agregar ${cat.singular}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

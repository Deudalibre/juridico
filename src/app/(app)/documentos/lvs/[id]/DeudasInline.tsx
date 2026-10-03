"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Field, toast } from "@/components/ui";
import { Modal } from "@/components/ui/Dialog";
import { CALIDADES, NATURALEZAS, buscarAcreedores, totalDeudas, type AcreedorLite, type Deuda } from "@/lib/lvs-acreedores";
import { formatRut } from "@/lib/rut";
import { crearAcreedor, deleteDeuda, saveDeuda } from "../deudas-actions";

const pesos = (n: number | null) => (n == null ? "" : `$ ${n.toLocaleString("es-CL")}`);
const soloDigitos = (s: string) => s.replace(/[^\d]/g, "");

/**
 * Deudas del expediente (Anexo 9) dentro de la Ficha Maestra: el operador escribe parte del nombre o el RUT,
 * elige el acreedor del catálogo y se rellenan RUT, correo y teléfono; solo pone monto y naturaleza. Lo que no
 * esté en el catálogo se agrega una vez («nuevo») y queda para los demás clientes.
 */
export function DeudasInline({ clientId, deudas, catalogo, canEdit }: { clientId: string; deudas: Deuda[]; catalogo: AcreedorLite[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<AcreedorLite | null>(null);
  const [monto, setMonto] = useState("");
  const [naturaleza, setNaturaleza] = useState<string>("Valista");
  const [nuevo, setNuevo] = useState<{ nombre: string; rut: string; email: string; telefono: string } | null>(null);
  const [editing, setEditing] = useState<Deuda | null>(null);
  const [abierto, setAbierto] = useState(false);
  const montoRef = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => (sel ? [] : buscarAcreedores(catalogo, q)), [catalogo, q, sel]);
  const total = totalDeudas(deudas);

  const elegir = (a: AcreedorLite) => {
    setSel(a);
    setQ(a.nombre);
    setAbierto(false);
    setTimeout(() => montoRef.current?.focus(), 0);
  };
  const limpiar = () => {
    setSel(null);
    setQ("");
    setMonto("");
    setNaturaleza("Valista");
  };
  const agregar = (acreedor: AcreedorLite | null) => {
    if (!acreedor && !nuevo) return toast("Elige un acreedor del catálogo o créalo como nuevo.", true);
    const fd = new FormData();
    if (acreedor) {
      fd.set("acreedor_id", acreedor.id);
      fd.set("nombre", acreedor.nombre);
      fd.set("rut", acreedor.rut ?? "");
      fd.set("email", acreedor.email ?? "");
      fd.set("telefono", acreedor.telefono ?? "");
      fd.set("origen_credito", acreedor.naturaleza ?? "");
    }
    fd.set("monto", soloDigitos(monto));
    fd.set("naturaleza", naturaleza);
    start(async () => {
      const r = await saveDeuda(clientId, null, fd);
      if (r.error) toast(r.error, true);
      else {
        limpiar();
        router.refresh();
      }
    });
  };
  const crearYAgregar = () => {
    if (!nuevo?.nombre.trim()) return;
    start(async () => {
      const r = await crearAcreedor({ nombre: nuevo.nombre, rut: nuevo.rut || null, email: nuevo.email || null, telefono: nuevo.telefono || null });
      if (r.error || !r.id) return toast(r.error ?? "No se pudo crear el acreedor", true);
      const a: AcreedorLite = { id: r.id, nombre: nuevo.nombre.trim(), rut: nuevo.rut || null, alias: [], email: nuevo.email || null, telefono: nuevo.telefono || null, naturaleza: null };
      setNuevo(null);
      toast("Acreedor agregado al catálogo");
      agregar(a);
    });
  };
  const quitar = (d: Deuda) => {
    if (!confirm(`¿Quitar la deuda con ${d.nombre}?`)) return;
    start(async () => {
      const r = await deleteDeuda(clientId, d.id);
      if (r.error) toast(r.error, true);
      else router.refresh();
    });
  };

  return (
    <div className="rounded-lg border border-line-soft" style={{ background: "var(--band)" }}>
      {canEdit && (
        <div className="relative flex flex-wrap items-center gap-2 px-3 py-2">
          <div className="relative min-w-[260px] flex-1">
            <input
              className="input !min-h-[30px] w-full text-[12.5px]"
              placeholder="Acreedor: nombre o RUT (falabella, 96.509.660-4…)"
              value={q}
              disabled={pending}
              onChange={(e) => {
                setQ(e.target.value);
                setSel(null);
                setAbierto(true);
              }}
              onFocus={() => setAbierto(true)}
              onBlur={() => setTimeout(() => setAbierto(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (resultados[0]) elegir(resultados[0]);
                } else if (e.key === "Escape") setAbierto(false);
              }}
              aria-label="Buscar acreedor"
              autoComplete="off"
            />
            {abierto && q.trim() && !sel && (
              <div className="menu-content absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto">
                {resultados.map((a) => (
                  <button key={a.id} type="button" className="menu-item w-full justify-between gap-3 text-left" onMouseDown={(e) => e.preventDefault()} onClick={() => elegir(a)}>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] font-medium text-fg">{a.nombre}</span>
                      <span className="truncate text-[11px] text-muted">
                        {a.rut ? formatRut(a.rut) : "sin RUT"}
                        {a.email ? ` · ${a.email}` : ""}
                        {a.telefono ? ` · ${a.telefono}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="menu-item w-full gap-2 text-left text-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setAbierto(false);
                    setNuevo({ nombre: q.trim(), rut: "", email: "", telefono: "" });
                  }}
                >
                  <Icon name="plus" size={13} /> «{q.trim()}» no está en el catálogo: agregarlo
                </button>
              </div>
            )}
          </div>
          {sel && (
            <span className="tag brand max-w-[260px] truncate" title={`${sel.rut ? formatRut(sel.rut) : ""} ${sel.email ?? ""} ${sel.telefono ?? ""}`}>
              {sel.rut ? formatRut(sel.rut) : "sin RUT"} · {sel.email ?? "sin correo"}
            </span>
          )}
          <input ref={montoRef} className="input !min-h-[30px] w-[150px] text-[12.5px] tabnum" placeholder="Monto $" inputMode="numeric" value={monto} disabled={pending} onChange={(e) => setMonto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregar(sel))} aria-label="Monto" />
          <select className="input !min-h-[30px] w-[140px] text-[12.5px]" value={naturaleza} disabled={pending} onChange={(e) => setNaturaleza(e.target.value)} aria-label="Naturaleza de la deuda">
            {NATURALEZAS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary btn-sm" disabled={pending || !sel} onClick={() => agregar(sel)}>
            Agregar
          </button>
        </div>
      )}
      {deudas.length === 0 ? (
        <div className="border-t border-line-soft bg-surface px-3 py-3 text-[12px] text-faint">Sin deudas cargadas. Escribe el acreedor arriba: el catálogo del estudio rellena RUT, correo y teléfono.</div>
      ) : (
        <>
          {deudas.map((d, i) => (
            <div key={d.id} className="flex min-h-[40px] items-center gap-3 border-t border-line-soft bg-surface px-3 py-1.5">
              <span className="tabnum w-5 text-[12px] font-semibold text-muted">{i + 1}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">{d.nombre}</span>
                  <span className={`tag shrink-0 ${d.naturaleza === "Valista" ? "" : "brand"}`}>{d.naturaleza}</span>
                  {d.calidad !== "Deudor principal" && <span className="tag warn shrink-0">{d.calidad}</span>}
                  {!d.cmf && <span className="tag shrink-0">No CMF</span>}
                </span>
                <span className="truncate text-[11.5px] text-muted">
                  {d.rut ? formatRut(d.rut) : "sin RUT"}
                  {d.email ? ` · ${d.email}` : ""}
                  {d.telefono ? ` · ${d.telefono}` : ""}
                </span>
              </span>
              <span className="tabnum w-28 text-right text-[13px] font-semibold text-fg">{pesos(d.monto) || <span className="text-warning">sin monto</span>}</span>
              {canEdit && (
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(d)} disabled={pending}>
                    <Icon name="edit" size={13} /> Editar
                  </button>
                  <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => quitar(d)} disabled={pending} aria-label="Quitar deuda">
                    <Icon name="trash" size={13} />
                  </button>
                </span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-end gap-3 border-t border-line bg-surface px-3 py-2 text-[12.5px]">
            <span className="text-muted">
              {deudas.length} {deudas.length === 1 ? "deuda" : "deudas"} · total Anexo 9
            </span>
            <span className="tabnum text-[14px] font-semibold text-fg">{pesos(total)}</span>
          </div>
        </>
      )}
      {nuevo && (
        <Modal title="Acreedor nuevo en el catálogo" subtitle="Queda disponible para todos los clientes. RUT, correo y teléfono salen después en el Anexo 9." onClose={() => setNuevo(null)} busy={pending}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              crearYAgregar();
            }}
            className="flex flex-col gap-3"
          >
            <Field label="Nombre o razón social">
              <input className="input" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required autoComplete="off" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="RUT">
                <input className="input tabnum" value={nuevo.rut} onChange={(e) => setNuevo({ ...nuevo, rut: e.target.value })} placeholder="96.509.660-4" autoComplete="off" />
              </Field>
              <Field label="Teléfono">
                <input className="input tabnum" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} autoComplete="off" />
              </Field>
            </div>
            <Field label="Correo">
              <input className="input" type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} autoComplete="off" />
            </Field>
            <div className="flex justify-end gap-2 border-t border-line-soft pt-3">
              <button type="button" className="btn-ghost" onClick={() => setNuevo(null)} disabled={pending}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={pending}>
                {pending ? "Guardando…" : "Crear y agregar la deuda"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {editing && <DeudaModal clientId={clientId} deuda={editing} onClose={() => setEditing(null)} onSaved={() => {
        setEditing(null);
        router.refresh();
      }} />}
    </div>
  );
}

/** Edición completa de una deuda: lo del Anexo 9 y lo interno. */
function DeudaModal({ clientId, deuda: d, onClose, onSaved }: { clientId: string; deuda: Deuda; onClose: () => void; onSaved: () => void }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState({ nombre: d.nombre, rut: formatRut(d.rut), email: d.email ?? "", telefono: d.telefono ?? "", monto: d.monto?.toString() ?? "", naturaleza: d.naturaleza, origen_credito: d.origen_credito ?? "", cmf: d.cmf ? "si" : "no", calidad: d.calidad, observaciones: d.observaciones ?? "" });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val);
    if (d.acreedor_id) fd.set("acreedor_id", d.acreedor_id);
    start(async () => {
      const r = await saveDeuda(clientId, d.id, fd);
      if (r.error) toast(r.error, true);
      else onSaved();
    });
  };
  return (
    <Modal title="Editar deuda" subtitle="Lo primero va al Anexo 9; lo demás es interno (demanda y control)." onClose={onClose} busy={pending} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-12">
          <Field label="Acreedor" className="sm:col-span-6">
            <input className="input" value={v.nombre} onChange={(e) => set("nombre", e.target.value)} required autoComplete="off" />
          </Field>
          <Field label="RUT" className="sm:col-span-3">
            <input className="input tabnum" value={v.rut} onChange={(e) => set("rut", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Teléfono" className="sm:col-span-3">
            <input className="input tabnum" value={v.telefono} onChange={(e) => set("telefono", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Correo" className="sm:col-span-6">
            <input className="input" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Monto (pesos)" className="sm:col-span-3">
            <input className="input tabnum" inputMode="numeric" value={v.monto} onChange={(e) => set("monto", e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Naturaleza" className="sm:col-span-3">
            <select className="input" value={v.naturaleza} onChange={(e) => set("naturaleza", e.target.value)}>
              {NATURALEZAS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cómo consta el crédito (para la demanda)" className="sm:col-span-12">
            <input className="input" value={v.origen_credito} onChange={(e) => set("origen_credito", e.target.value)} placeholder="contrato de mutuo de préstamo de dinero" autoComplete="off" />
          </Field>
          <Field label="Calidad del cliente" className="sm:col-span-4">
            <select className="input" value={v.calidad} onChange={(e) => set("calidad", e.target.value)}>
              {CALIDADES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Aparece en el informe CMF" className="sm:col-span-4">
            <div className="seg" role="radiogroup" aria-label="CMF">
              {(["si", "no"] as const).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={v.cmf === o} aria-current={v.cmf === o ? "true" : undefined} onClick={() => set("cmf", o)} className="min-w-[44px] justify-center">
                  {o === "si" ? "Sí" : "No"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Observaciones" className="sm:col-span-12">
            <input className="input" value={v.observaciones} onChange={(e) => set("observaciones", e.target.value)} autoComplete="off" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line-soft pt-3">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

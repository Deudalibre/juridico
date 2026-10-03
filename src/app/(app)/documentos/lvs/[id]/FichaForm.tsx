"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { LegalClient } from "@/lib/data";
import { ESTADOS_CIVILES, GENEROS, PREGUNTAS_273A, SITUACIONES_LABORALES, TIPOS_CONTRATO, type LvsFicha, type Pregunta273A } from "@/lib/lvs";
import { formatRut } from "@/lib/rut";
import { saveLvs } from "../actions";

type YN = "si" | "no" | "";
const yn = (v: boolean | null | undefined): YN => (v === true ? "si" : v === false ? "no" : "");

/** Sí / No en dos botones; sin responder queda vacío (y la ficha lo cuenta como pendiente). */
function YesNo({ name, value, onChange, disabled, label }: { name: string; value: YN; onChange: (v: YN) => void; disabled?: boolean; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <input type="hidden" name={name} value={value} />
      {(["si", "no"] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-current={value === v ? "true" : undefined} disabled={disabled} onClick={() => onChange(value === v ? "" : v)}>
          {v === "si" ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

/**
 * Ficha Maestra en un solo formulario: datos del cliente, antecedentes, tribunal, situación laboral, las ocho
 * preguntas del art. 273 A y la carta de insolvencia. Un «Guardar» (o Ctrl+S) para todo: pensado para cargar
 * decenas de clientes seguidos sin cambiar de pantalla.
 */
export function FichaForm({ client: c, ficha: f, canEdit }: { client: LegalClient; ficha: LvsFicha; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [relacion, setRelacion] = useState<YN>(yn(f.relacion_laboral));
  const [answers, setAnswers] = useState<Record<Pregunta273A, YN>>(() => Object.fromEntries(PREGUNTAS_273A.map((q) => [q.key, yn(f[q.key])])) as Record<Pregunta273A, YN>);
  const [genero, setGenero] = useState<"F" | "M" | "">(f.genero ?? "");
  const cartaOriginal = useRef<HTMLTextAreaElement>(null);
  const cartaDemanda = useRef<HTMLTextAreaElement>(null);

  // onSubmit en vez de action: React vacía los campos no controlados al terminar una «action», y si el guardado
  // falla (un RUT mal escrito) el operador perdería todo lo tecleado. Así los valores se quedan hasta que se guarde.
  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await saveLvs(c.id, fd);
      if (r.error) toast(r.error, true);
      else {
        toast(r.pct === 100 ? "Ficha guardada · completa" : `Ficha guardada · ${r.pct}%`);
        router.refresh();
      }
    });
  };

  // Ctrl+S guarda sin soltar el teclado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyCarta = () => {
    if (!cartaDemanda.current || !cartaOriginal.current) return;
    if (cartaDemanda.current.value.trim() && !confirm("La versión para la demanda ya tiene texto. ¿Reemplazarla con el original?")) return;
    cartaDemanda.current.value = cartaOriginal.current.value;
    cartaDemanda.current.focus();
  };

  const disabled = !canEdit || pending;
  return (
    <form ref={formRef} onSubmit={save} className="flex flex-col gap-3">
      <fieldset disabled={disabled} className="contents">
        {/* ---- Cliente ---- */}
        <section className="panel gap-4 px-5 py-5">
          <div className="flex flex-col gap-0.5">
            <span className="card-title">Cliente</span>
            <span className="text-[12.5px] text-muted">Los mismos datos de la causa: corregirlos aquí los corrige en todas partes.</span>
          </div>
          <div className="grid-fields">
            <Field label="Nombre completo" className="sm:col-span-2">
              <input name="full_name" className="input" defaultValue={c.full_name} required autoComplete="off" />
            </Field>
            <Field label="RUT">
              <input name="rut" className="input tabnum" defaultValue={formatRut(c.rut)} placeholder="12.345.678-5" autoComplete="off" />
            </Field>
            <Field label="Género">
              <div className="seg" role="radiogroup" aria-label="Género">
                <input type="hidden" name="genero" value={genero} />
                {(Object.keys(GENEROS) as ("F" | "M")[]).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={genero === g} aria-current={genero === g ? "true" : undefined} onClick={() => setGenero(g)}>
                    {GENEROS[g]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Nacionalidad">
              <input name="nacionalidad" className="input" defaultValue={f.nacionalidad} autoComplete="off" />
            </Field>
            <Field label="Estado civil">
              <select name="estado_civil" className="input" defaultValue={f.estado_civil ?? ""}>
                <option value="">Sin definir</option>
                {ESTADOS_CIVILES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Profesión u oficio">
              <input name="profesion_oficio" className="input" defaultValue={f.profesion_oficio ?? ""} placeholder="dueña de casa, vendedor, técnico en…" autoComplete="off" />
            </Field>
            <Field label="Teléfono">
              <input name="phone" className="input tabnum" defaultValue={c.phone ?? ""} autoComplete="off" />
            </Field>
            <Field label="Email">
              <input name="email" type="email" className="input" defaultValue={c.email ?? ""} autoComplete="off" />
            </Field>
          </div>
          <div className="grid-fields">
            <Field label="Domicilio" className="sm:col-span-2">
              <input name="domicilio" className="input" defaultValue={f.domicilio ?? ""} placeholder="calle, número, depto o casa" autoComplete="off" />
            </Field>
            <Field label="Comuna">
              <input name="comuna" className="input" defaultValue={f.comuna ?? ""} autoComplete="off" />
            </Field>
            <Field label="Región">
              <input name="region" className="input" defaultValue={f.region ?? ""} placeholder="región Metropolitana" autoComplete="off" />
            </Field>
          </div>
        </section>

        {/* ---- Tribunal y situación laboral ---- */}
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="panel gap-4 px-5 py-5">
            <div className="flex flex-col gap-0.5">
              <span className="card-title">Tribunal</span>
              <span className="text-[12.5px] text-muted">La suma de la demanda sale tal cual se escriba aquí.</span>
            </div>
            <div className="flex flex-col gap-4">
              <Field label="Comuna del tribunal">
                <input name="comuna_tribunal" className="input" defaultValue={f.comuna_tribunal ?? ""} autoComplete="off" />
              </Field>
              <Field label="Encabezado de la demanda (S.J.L.)">
                <input name="sj_comuna" className="input" defaultValue={f.sj_comuna ?? ""} placeholder="S.J.L. Civil de Santiago" autoComplete="off" />
              </Field>
            </div>
          </section>

          <section className="panel gap-4 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="card-title">Situación laboral</span>
                <span className="text-[12.5px] text-muted">Con relación laboral vigente la demanda acompaña contrato y tres liquidaciones.</span>
              </div>
              <YesNo name="relacion_laboral" value={relacion} onChange={setRelacion} disabled={disabled} label="Relación laboral vigente" />
            </div>
            <div className="grid-fields">
              <Field label="Situación">
                <select name="situacion_laboral" className="input" defaultValue={f.situacion_laboral ?? ""}>
                  <option value="">Sin definir</option>
                  {SITUACIONES_LABORALES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ingreso líquido mensual">
                <input name="ingreso_liquido" className="input tabnum" inputMode="numeric" defaultValue={f.ingreso_liquido ?? ""} placeholder="650000" autoComplete="off" />
              </Field>
              {relacion === "si" && (
                <>
                  <Field label="Empleador" className="sm:col-span-2">
                    <input name="empleador" className="input" defaultValue={f.empleador ?? ""} autoComplete="off" />
                  </Field>
                  <Field label="RUT empleador">
                    <input name="rut_empleador" className="input tabnum" defaultValue={formatRut(f.rut_empleador)} autoComplete="off" />
                  </Field>
                  <Field label="Inicio del contrato">
                    <input name="fecha_inicio_contrato" type="date" className="input tabnum" defaultValue={f.fecha_inicio_contrato ?? ""} />
                  </Field>
                  <Field label="Tipo de contrato">
                    <select name="tipo_contrato" className="input" defaultValue={f.tipo_contrato ?? ""}>
                      <option value="">Sin definir</option>
                      {TIPOS_CONTRATO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </div>
          </section>
        </div>

        {/* ---- Art. 273 A ---- */}
        <section className="panel gap-3 px-5 py-5">
          <div className="flex flex-col gap-0.5">
            <span className="card-title">Artículo 273 A · ¿qué tiene el cliente?</span>
            <span className="text-[12.5px] text-muted">Ocho respuestas. Cada «sí» abre su lista en las pestañas Bienes y Juicios y cambia el párrafo correspondiente de la demanda.</span>
          </div>
          <div className="grid gap-x-6 sm:grid-cols-2">
            {PREGUNTAS_273A.map((q) => (
              <div key={q.key} className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium text-fg">{q.label}</span>
                  <span className="truncate text-[11.5px] text-muted">{q.hint}</span>
                </span>
                <YesNo name={q.key} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} disabled={disabled} label={q.label} />
              </div>
            ))}
          </div>
        </section>

        {/* ---- Carta de insolvencia ---- */}
        <section className="panel gap-4 px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="card-title">Carta de insolvencia</span>
              <span className="text-[12.5px] text-muted">A la izquierda, lo que escribió el cliente (se conserva). A la derecha, la versión que va en «Hechos» de la demanda.</span>
            </div>
            <button type="button" className="btn-outline btn-sm" onClick={copyCarta} disabled={disabled}>
              <Icon name="chevron" size={13} /> Usar el original como base
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Texto original del cliente">
              <textarea ref={cartaOriginal} name="carta_original" className="input min-h-[220px] resize-y leading-relaxed" defaultValue={f.carta_original ?? ""} placeholder="Pega aquí el relato del cliente tal como llegó." />
            </Field>
            <Field label="Versión para la demanda">
              <textarea ref={cartaDemanda} name="carta_demanda" className="input min-h-[220px] resize-y leading-relaxed" defaultValue={f.carta_demanda ?? ""} placeholder="Redacción revisada por el abogado. Los saltos de párrafo se respetan en el Word." />
            </Field>
          </div>
        </section>
      </fieldset>

      {canEdit && (
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-[var(--shadow-lift)]">
          <span className="text-[12px] text-muted">Ctrl+S también guarda</span>
          <button className="btn-primary" disabled={pending}>
            {pending ? "Guardando…" : "Guardar ficha"}
          </button>
        </div>
      )}
    </form>
  );
}

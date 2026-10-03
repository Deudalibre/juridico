"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { LegalClient } from "@/lib/data";
import { ESTADOS_CIVILES, GENEROS, PREGUNTAS_273A, PREGUNTAS_BIENES, PREGUNTA_JUICIOS, SITUACIONES_LABORALES, TIPOS_CONTRATO, type LvsFicha, type Pregunta273A } from "@/lib/lvs";
import { formatRut } from "@/lib/rut";
import { saveLvs } from "../actions";

type YN = "si" | "no" | "";
const yn = (v: boolean | null | undefined): YN => (v === true ? "si" : v === false ? "no" : "");

/** Sí / No en dos botones; sin responder queda vacío (y la ficha lo cuenta como pendiente). */
function YesNo({ name, value, onChange, disabled, label }: { name: string; value: YN; onChange: (v: YN) => void; disabled?: boolean; label: string }) {
  return (
    <div className="seg shrink-0" role="radiogroup" aria-label={label}>
      <input type="hidden" name={name} value={value} />
      {(["si", "no"] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-current={value === v ? "true" : undefined} disabled={disabled} onClick={() => onChange(value === v ? "" : v)} className="min-w-[44px] justify-center">
          {v === "si" ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

/** Bloque encuadrado: número y título a la izquierda, campos a la derecha; todos alineados a la misma rejilla. */
function Section({ n, title, hint, aside, children }: { n: number; title: string; hint: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-4 border-t border-line-soft px-5 py-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <div className="flex items-start gap-3">
        <span className="tabnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold text-accent" style={{ background: "var(--surface-active)" }}>
          {n}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="card-title">{title}</span>
          <span className="text-[12px] leading-relaxed text-muted">{hint}</span>
          {aside && <div className="mt-1">{aside}</div>}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-12">{children}</div>
    </div>
  );
}

type Progress = { pct: number; missing: string[] };

/**
 * Ficha Maestra en un solo formulario: datos del cliente, antecedentes, tribunal, situación laboral, las siete
 * preguntas del art. 273 A y la carta de insolvencia. Un «Guardar» (o Ctrl+S) para todo: pensado para cargar
 * decenas de clientes seguidos sin cambiar de pantalla.
 */
export function FichaForm({ client: c, ficha: f, canEdit, progress }: { client: LegalClient; ficha: LvsFicha; canEdit: boolean; progress: Progress }) {
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
  const complete = progress.pct === 100;
  return (
    <form ref={formRef} onSubmit={save} className="flex flex-col gap-3">
      <fieldset disabled={disabled} className="contents">
        <div className="panel overflow-hidden">
          {/* ---- Avance ---- */}
          <div className="panel-head !py-3 flex-wrap gap-x-4 gap-y-2">
            <span className="card-title">Ficha Maestra</span>
            <span className="h-1.5 w-40 overflow-hidden rounded-full" style={{ background: "var(--border)" }} aria-hidden>
              <span className="block h-full rounded-full bar-grow" style={{ width: `${progress.pct}%`, background: complete ? "var(--success)" : "var(--brand-dark)" }} />
            </span>
            <span className={`tabnum text-[12.5px] font-semibold ${complete ? "text-success" : "text-fg"}`}>{progress.pct}%</span>
            <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{complete ? "Completa: ya alimenta la demanda, la Declaración 273-A y los anexos." : `Falta: ${progress.missing.join(", ")}`}</span>
          </div>

          {/* ---- 1 · Cliente ---- */}
          <Section n={1} title="Cliente" hint="Los mismos datos de la causa: corregirlos aquí los corrige en todas partes.">
            <Field label="Nombre completo" className="sm:col-span-6">
              <input name="full_name" className="input" defaultValue={c.full_name} required autoComplete="off" />
            </Field>
            <Field label="RUT" className="sm:col-span-3">
              <input name="rut" className="input tabnum" defaultValue={formatRut(c.rut)} placeholder="12.345.678-5" autoComplete="off" />
            </Field>
            <Field label="Género" className="sm:col-span-3">
              <div className="seg" role="radiogroup" aria-label="Género">
                <input type="hidden" name="genero" value={genero} />
                {(Object.keys(GENEROS) as ("F" | "M")[]).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={genero === g} aria-current={genero === g ? "true" : undefined} onClick={() => setGenero(g)} className="flex-1 justify-center">
                    {GENEROS[g]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Nacionalidad" className="sm:col-span-3">
              <input name="nacionalidad" className="input" defaultValue={f.nacionalidad} autoComplete="off" />
            </Field>
            <Field label="Estado civil" className="sm:col-span-3">
              <select name="estado_civil" className="input" defaultValue={f.estado_civil ?? ""}>
                <option value="">Sin definir</option>
                {ESTADOS_CIVILES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Profesión u oficio" className="sm:col-span-6">
              <input name="profesion_oficio" className="input" defaultValue={f.profesion_oficio ?? ""} placeholder="dueña de casa, vendedor, técnico en…" autoComplete="off" />
            </Field>
            <Field label="Teléfono" className="sm:col-span-4">
              <input name="phone" className="input tabnum" defaultValue={c.phone ?? ""} placeholder="+56 9 1234 5678" autoComplete="off" />
            </Field>
            <Field label="Email" className="sm:col-span-8">
              <input name="email" type="email" className="input" defaultValue={c.email ?? ""} autoComplete="off" />
            </Field>
            <Field label="Domicilio" className="sm:col-span-6">
              <input name="domicilio" className="input" defaultValue={f.domicilio ?? ""} placeholder="calle, número, depto o casa" autoComplete="off" />
            </Field>
            <Field label="Comuna" className="sm:col-span-3">
              <input name="comuna" className="input" defaultValue={f.comuna ?? ""} autoComplete="off" />
            </Field>
            <Field label="Región" className="sm:col-span-3">
              <input name="region" className="input" defaultValue={f.region ?? ""} placeholder="Metropolitana" autoComplete="off" />
            </Field>
          </Section>

          {/* ---- 2 · Tribunal ---- */}
          <Section n={2} title="Tribunal" hint="La suma de la demanda sale tal cual se escriba aquí. La competencia no se calcula todavía.">
            <Field label="Comuna del tribunal" className="sm:col-span-4">
              <input name="comuna_tribunal" className="input" defaultValue={f.comuna_tribunal ?? ""} autoComplete="off" />
            </Field>
            <Field label="Encabezado de la demanda (S.J.L.)" className="sm:col-span-8">
              <input name="sj_comuna" className="input" defaultValue={f.sj_comuna ?? ""} placeholder="S.J.L. Civil de Santiago" autoComplete="off" />
            </Field>
          </Section>

          {/* ---- 3 · Situación laboral ---- */}
          <Section
            n={3}
            title="Situación laboral"
            hint="Con relación laboral vigente, la demanda acompaña el contrato y las tres últimas liquidaciones."
            aside={<YesNo name="relacion_laboral" value={relacion} onChange={setRelacion} disabled={disabled} label="Relación laboral vigente" />}
          >
            <Field label="Situación" className="sm:col-span-3">
              <select name="situacion_laboral" className="input" defaultValue={f.situacion_laboral ?? ""}>
                <option value="">Sin definir</option>
                {SITUACIONES_LABORALES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ingreso líquido mensual" className="sm:col-span-3">
              <input name="ingreso_liquido" className="input tabnum" inputMode="numeric" defaultValue={f.ingreso_liquido ?? ""} placeholder="650000" autoComplete="off" />
            </Field>
            {relacion === "si" ? (
              <>
                <Field label="Empleador" className="sm:col-span-6">
                  <input name="empleador" className="input" defaultValue={f.empleador ?? ""} autoComplete="off" />
                </Field>
                <Field label="RUT empleador" className="sm:col-span-4">
                  <input name="rut_empleador" className="input tabnum" defaultValue={formatRut(f.rut_empleador)} autoComplete="off" />
                </Field>
                <Field label="Inicio del contrato" className="sm:col-span-4">
                  <input name="fecha_inicio_contrato" type="date" className="input tabnum" defaultValue={f.fecha_inicio_contrato ?? ""} />
                </Field>
                <Field label="Tipo de contrato" className="sm:col-span-4">
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
            ) : (
              <div className="flex items-end pb-2 text-[12px] text-faint sm:col-span-6">{relacion === "no" ? "Sin relación laboral vigente: no se piden contrato ni liquidaciones." : "Responde Sí o No a la izquierda."}</div>
            )}
          </Section>

          {/* ---- 4 · Art. 273 A, numeral 1: patrimonio ---- */}
          <Section n={4} title="Patrimonio · art. 273 A n.º 1" hint="Seis categorías de bienes, una por anexo (3 a 8). Cada «sí» abre su lista en Bienes y cambia el párrafo correspondiente de la demanda; la exclusión se marca bien por bien.">
            <div className="grid gap-x-8 sm:col-span-12 sm:grid-cols-2">
              {PREGUNTAS_BIENES.map((q) => (
                <div key={q.key} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-[13px] font-medium text-fg">{q.label}</span>
                    <span className="truncate text-[11.5px] text-muted">{q.hint}</span>
                  </span>
                  <YesNo name={q.key} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} disabled={disabled} label={q.label} />
                </div>
              ))}
            </div>
          </Section>

          {/* ---- 5 · Art. 273 A, numeral 4: juicios ---- */}
          <Section n={5} title="Juicios pendientes · art. 273 A n.º 4" hint="Incluye causas en cumplimiento incidental o ejecutivo. Con «sí» se detallan en la pestaña Juicios (rol, tribunal, corte, estado, calidad y monto).">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 sm:col-span-12">
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-fg">{PREGUNTA_JUICIOS.label}</span>
                <span className="truncate text-[11.5px] text-muted">{PREGUNTA_JUICIOS.hint}</span>
              </span>
              <YesNo name={PREGUNTA_JUICIOS.key} value={answers[PREGUNTA_JUICIOS.key]} onChange={(v) => setAnswers((a) => ({ ...a, [PREGUNTA_JUICIOS.key]: v }))} disabled={disabled} label={PREGUNTA_JUICIOS.label} />
            </div>
          </Section>

          {/* ---- 6 · Carta de insolvencia ---- */}
          <Section
            n={6}
            title="Carta de insolvencia"
            hint="A la izquierda, lo que escribió el cliente (se conserva). A la derecha, la versión que va en «Hechos» de la demanda; los saltos de párrafo se respetan en el Word."
            aside={
              <button type="button" className="btn-outline btn-sm" onClick={copyCarta} disabled={disabled}>
                <Icon name="chevron" size={13} /> Usar el original como base
              </button>
            }
          >
            <Field label="Texto original del cliente" className="sm:col-span-6">
              <textarea ref={cartaOriginal} name="carta_original" className="input min-h-[240px] resize-y leading-relaxed" defaultValue={f.carta_original ?? ""} placeholder="Pega aquí el relato del cliente tal como llegó." />
            </Field>
            <Field label="Versión para la demanda" className="sm:col-span-6">
              <textarea ref={cartaDemanda} name="carta_demanda" className="input min-h-[240px] resize-y leading-relaxed" defaultValue={f.carta_demanda ?? ""} placeholder="Redacción revisada por el abogado." />
            </Field>
          </Section>
        </div>
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

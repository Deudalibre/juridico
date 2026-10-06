"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { LegalClient } from "@/lib/data";
import { ESTADOS_CIVILES, GENEROS, PREGUNTAS_273A, PREGUNTAS_BIENES, PREGUNTA_JUICIOS, type LvsFicha, type Pregunta273A } from "@/lib/lvs";
import { formatRut } from "@/lib/rut";
import { CATEGORIAS, type BienCategoria, type BienRow, type BienesPorCategoria } from "@/lib/lvs-bienes";
import { BienesInline } from "./BienesInline";
import { DeudasInline } from "./DeudasInline";
import type { AcreedorLite, Deuda } from "@/lib/lvs-acreedores";
import { saveLvs } from "../actions";

type YN = "si" | "no" | "";

/** Grupo dentro de un bloque: título y ayuda corta a la izquierda, campos en rejilla a la derecha (como los paneles
 * de configuración de las apps profesionales: se lee de un vistazo y los campos quedan alineados). */
function Grp({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="lvs-group sm:col-span-12">
      <div className="lvs-group-head">
        <span className="lvs-cap">{title}</span>
        {hint && <span className="lvs-group-hint">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-12">{children}</div>
    </div>
  );
}

/** Triángulo discreto junto a la etiqueta de un dato que falta (en vez de la franja «Falta: …» de arriba). */
function Miss({ when, what }: { when: boolean; what: string }) {
  if (!when) return null;
  return (
    <span className="miss" title={`Falta: ${what}`} aria-label={`Falta ${what}`}>
      <Icon name="alert" size={11} />
    </span>
  );
}
const yn = (v: boolean | null | undefined): YN => (v === true ? "si" : v === false ? "no" : "");

/** Sí / No en dos botones; sin responder queda vacío (y la ficha lo cuenta como pendiente). */
function YesNo({ name, value, onChange, disabled, label }: { name: string; value: YN; onChange: (v: YN) => void; disabled?: boolean; label: string }) {
  return (
    <div className="seg yn shrink-0" role="radiogroup" aria-label={label}>
      <input type="hidden" name={name} value={value} />
      {(["si", "no"] as const).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-current={value === v ? "true" : undefined} disabled={disabled} onClick={() => onChange(value === v ? "" : v)} className={`min-w-[44px] justify-center ${v === "no" ? "no" : ""}`}>
          {v === "si" ? "Sí" : "No"}
        </button>
      ))}
    </div>
  );
}

/**
 * Una pregunta Sí/No del art. 273 A con su submenú justo debajo: al marcar «Sí» (o si ya hay elementos cargados)
 * se abre la lista de esa categoría, con un chevrón para plegarla sin perder nada.
 */
function PreguntaConLista({ q, cat, rows, value, onChange, clientId, canEdit, disabled }: { q: { key: Pregunta273A; label: string; hint: string }; cat: BienCategoria; rows: BienRow[]; value: YN; onChange: (v: YN) => void; clientId: string; canEdit: boolean; disabled: boolean }) {
  const activa = value === "si" || rows.length > 0;
  // Plegada por defecto si ya hay elementos cargados: el operador ve el resumen y abre solo lo que va a tocar
  const [abierta, setAbierta] = useState(rows.length === 0);
  const open = activa && abierta;
  const toggle = () => activa && setAbierta((o) => !o);
  // Resumen de lo cargado, para leerlo sin abrir: «Chevrolet Sail 2018 · Toyota Yaris» (+ N más)
  const resumen = rows
    .slice(0, 3)
    .map((r) => cat.resumen(r).titulo)
    .join(" · ");
  const extra = rows.length > 3 ? ` · +${rows.length - 3} más` : "";
  return (
    <div className={`acc ${activa ? "activa" : ""} ${open ? "open" : ""}`}>
      <div
        className="acc-head"
        role={activa ? "button" : undefined}
        tabIndex={activa ? 0 : undefined}
        aria-expanded={activa ? open : undefined}
        onClick={toggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}
      >
        <span className="acc-chev" aria-hidden>
          <Icon name="chevron" size={14} />
        </span>
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="shrink-0 text-[13px] font-medium text-fg">
            {q.label}
            <Miss when={value === ""} what="responder Sí o No" />
          </span>
          {rows.length > 0 && <span className="tag brand shrink-0">{rows.length}</span>}
          {cat.anexo && <span className="shrink-0 text-[11px] text-faint">Anexo {cat.anexo}</span>}
          {rows.length > 0 && !open ? (
            <span className="truncate text-[12px] text-soft" title={rows.map((r) => cat.resumen(r).titulo).join(" · ")}>
              · {resumen}
              {extra}
            </span>
          ) : (
            <span className="truncate text-[11.5px] text-muted" title={q.hint}>
              · {q.hint}
            </span>
          )}
        </span>
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <YesNo
            name={q.key}
            value={value}
            onChange={(v) => {
              onChange(v);
              // Marcar «Sí» despliega la lista siempre (aunque se hubiera plegado); el chevrón la esconde cuando se quiera
              if (v === "si") setAbierta(true);
            }}
            disabled={disabled}
            label={q.label}
          />
        </span>
      </div>
      {open && (
        <div className="acc-body">
          <BienesInline clientId={clientId} cat={cat} rows={rows} canEdit={canEdit} />
          {value !== "si" && rows.length > 0 && <span className="mt-1 block text-[11.5px] text-warning">Hay elementos cargados pero la respuesta no es «Sí»: no saldrán en los documentos.</span>}
        </div>
      )}
    </div>
  );
}

/** Bloque encuadrado: número y título a la izquierda, campos a la derecha; todos alineados a la misma rejilla. */
/** Cada bloque de la ficha es una tarjeta: banda con número, título y una ayuda corta; los campos a todo el ancho. */
function Section({ id, n, title, hint, aside, children }: { id: string; n: number; title: string; hint: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-3 overflow-hidden">
      <div className="panel-head !py-2 flex-wrap justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="lvs-n tabnum">{n}</span>
          <span className="card-title">{title}</span>
          <span className="text-[12px] text-muted">{hint}</span>
        </div>
        {aside}
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 px-4 py-3 sm:grid-cols-12">{children}</div>
    </section>
  );
}

type Progress = { pct: number; missing: string[] };

/**
 * Ficha Maestra en un solo formulario: datos del cliente, antecedentes, tribunal, situación laboral, las siete
 * preguntas del art. 273 A y la carta de insolvencia. Un «Guardar» (o Ctrl+S) para todo: pensado para cargar
 * decenas de clientes seguidos sin cambiar de pantalla.
 */
export function FichaForm({ client: c, ficha: f, canEdit, progress, bienes, deudas, catalogo }: { client: LegalClient; ficha: LvsFicha; canEdit: boolean; progress: Progress; bienes: BienesPorCategoria; deudas: Deuda[]; catalogo: AcreedorLite[] }) {
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
  const falta = (k: string) => progress.missing.includes(k);
  const lab = (text: string, k: string) => (
    <>
      {text}
      <Miss when={falta(k)} what={k} />
    </>
  );
  return (
    <form ref={formRef} onSubmit={save} className="lvs-form flex flex-col gap-3">
      <fieldset disabled={disabled} className="contents">
        {/* Lo que falta se marca junto a cada campo (triángulo sutil), no en una franja arriba */}

          {/* ---- 1 · Cliente, tribunal y trabajo: un solo bloque, tres filas (antes eran tres paneles) ---- */}
          <Section id="cliente" n={1} title="Cliente" hint="Persona, tribunal y trabajo. Valen para todos los documentos.">
            <Grp title="Identificación" hint="Como aparece en la cédula">
            <Field label={lab("Nombre completo", "nombre")} className="sm:col-span-4">
              <input name="full_name" className="input" defaultValue={c.full_name} required autoComplete="off" />
            </Field>
            <Field label={lab("RUT", "RUT")} className="sm:col-span-2">
              <input name="rut" className="input tabnum" defaultValue={formatRut(c.rut)} placeholder="12.345.678-5" autoComplete="off" />
            </Field>
            <Field label={lab("Género", "género")} className="sm:col-span-2">
              <div className="seg yn" role="radiogroup" aria-label="Género">
                <input type="hidden" name="genero" value={genero} />
                {(Object.keys(GENEROS) as ("F" | "M")[]).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={genero === g} aria-current={genero === g ? "true" : undefined} onClick={() => setGenero(g)} className="flex-1 justify-center">
                    {GENEROS[g] === "Femenino" ? "F" : GENEROS[g] === "Masculino" ? "M" : GENEROS[g]}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={lab("Estado civil", "estado civil")} className="sm:col-span-2">
              <select name="estado_civil" className="input" defaultValue={f.estado_civil ?? ""}>
                <option value="">Sin definir</option>
                {ESTADOS_CIVILES.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nacionalidad" className="sm:col-span-2">
              <input name="nacionalidad" className="input" defaultValue={f.nacionalidad?.trim() ? f.nacionalidad.trim().replace(/^./, (ch) => ch.toUpperCase()) : "Chilena"} placeholder="Chilena" autoComplete="off" />
            </Field>

            </Grp>
            <Grp title="Contacto" hint="Para citar y notificar">
            <Field label={lab("Profesión u oficio", "profesión u oficio")} className="sm:col-span-4">
              <input name="profesion_oficio" className="input" defaultValue={f.profesion_oficio ?? ""} placeholder="dueña de casa, vendedor…" autoComplete="off" />
            </Field>
            <Field label="Teléfono" className="sm:col-span-3">
              <input name="phone" className="input tabnum" defaultValue={c.phone ?? ""} placeholder="+56 9 1234 5678" autoComplete="off" />
            </Field>
            <Field label="Email" className="sm:col-span-5">
              <input name="email" type="email" className="input" defaultValue={c.email ?? ""} autoComplete="off" />
            </Field>
            </Grp>
            <Grp title="Domicilio y tribunal" hint="El S.J.L. se arma con la comuna">
            <Field label={lab("Domicilio", "domicilio")} className="sm:col-span-3">
              <input name="domicilio" className="input" defaultValue={f.domicilio ?? ""} placeholder="calle, número, depto o casa" autoComplete="off" />
            </Field>

            <Field label={lab("Comuna", "comuna")} className="sm:col-span-2">
              <input name="comuna" className="input" defaultValue={f.comuna ?? ""} autoComplete="off" />
            </Field>
            <Field label={lab("Región", "región")} className="sm:col-span-2">
              <input name="region" className="input" defaultValue={f.region ?? ""} placeholder="Metropolitana" autoComplete="off" />
            </Field>
            <Field label="Comuna del tribunal" className="sm:col-span-2">
              <input name="comuna_tribunal" className="input" defaultValue={f.comuna_tribunal ?? ""} autoComplete="off" />
            </Field>
            <Field label={lab("Encabezado de la demanda (S.J.L.)", "tribunal")} className="sm:col-span-3">
              <input name="sj_comuna" className="input" defaultValue={f.sj_comuna ?? ""} placeholder="S.J.L. Civil de Santiago" autoComplete="off" />
            </Field>

            {/* Trabajo: la pregunta y, si trabaja, el empleador en la misma fila */}
            </Grp>
            <Grp title="Trabajo" hint="Con trabajo: contrato y liquidaciones. Sin trabajo: 12 cotizaciones">
            <div className="flex flex-wrap items-end gap-3 sm:col-span-12">
              <span className="flex flex-col gap-1.5">
                <span className="label">{lab("¿Está trabajando?", "situación laboral")}</span>
                <YesNo name="relacion_laboral" value={relacion} onChange={setRelacion} disabled={disabled} label="¿Está trabajando?" />
              </span>
              {relacion === "si" ? (
                <>
                  <Field label="Empleador (nombre o razón social)" className="min-w-[260px] flex-1">
                    <input name="empleador" className="input" defaultValue={f.empleador ?? ""} autoComplete="off" />
                  </Field>
                  <Field label="RUT empleador" className="w-[180px]">
                    <input name="rut_empleador" className="input tabnum" defaultValue={formatRut(f.rut_empleador)} placeholder="76.123.456-0" autoComplete="off" />
                  </Field>
                </>
              ) : (
                <span className="pb-2 text-[12px] text-faint">{relacion === "no" ? "Sin empleador." : "Responde Sí o No."}</span>
              )}
            </div>
            </Grp>
          </Section>

          {/* ---- 2 · Art. 273 A: patrimonio (numeral 1) y juicios (numeral 4) en el mismo bloque ---- */}
          <Section id="patrimonio" n={2} title="Patrimonio y juicios · art. 273 A" hint="Sí/No por categoría; con «Sí» se carga la lista debajo. Un anexo por categoría.">
            <div className="flex flex-col sm:col-span-12">
              {PREGUNTAS_BIENES.map((q) => {
                const cat = CATEGORIAS.find((x) => x.pregunta === q.key)!;
                return <PreguntaConLista key={q.key} q={q} cat={cat} rows={bienes[cat.key]} value={answers[q.key]} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} clientId={c.id} canEdit={canEdit} disabled={disabled} />;
              })}
              <div id="juicios" className="scroll-mt-3">
                <PreguntaConLista q={PREGUNTA_JUICIOS} cat={CATEGORIAS.find((x) => x.key === "juicios")!} rows={bienes.juicios} value={answers.tiene_juicios} onChange={(v) => setAnswers((a) => ({ ...a, tiene_juicios: v }))} clientId={c.id} canEdit={canEdit} disabled={disabled} />
              </div>
            </div>
          </Section>

          {/* ---- 3 · Acreedores (Anexo 9) ---- */}
          <Section id="acreedores" n={3} title="Acreedores · Anexo N.º 9" hint="Escribe el nombre o el RUT y elige. Solo pones monto y naturaleza.">
            <div className="sm:col-span-12">
              <DeudasInline clientId={c.id} deudas={deudas} catalogo={catalogo} canEdit={canEdit} />
            </div>
          </Section>

          {/* ---- 4 · Carta de insolvencia ---- */}
          <Section
            id="carta" n={4}
            title="Carta de insolvencia"
            hint="Izquierda: lo que mandó el cliente. Derecha: lo que va en la demanda."
            aside={
              <button type="button" className="btn-outline btn-sm" onClick={copyCarta} disabled={disabled}>
                <Icon name="chevron" size={13} /> Usar el original como base
              </button>
            }
          >
            <Field label="Texto original del cliente" className="sm:col-span-6">
              <textarea ref={cartaOriginal} name="carta_original" className="input min-h-[120px] resize-y leading-relaxed" defaultValue={f.carta_original ?? ""} placeholder="Pega aquí el relato del cliente tal como llegó." />
            </Field>
            <Field label={lab("Versión para la demanda", "carta de insolvencia")} className="sm:col-span-6">
              <textarea ref={cartaDemanda} name="carta_demanda" className="input min-h-[120px] resize-y leading-relaxed" defaultValue={f.carta_demanda ?? ""} placeholder="Redacción revisada por el abogado." />
            </Field>
          </Section>
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

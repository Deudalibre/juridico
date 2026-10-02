"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Block, DocModel, Para } from "@/lib/docx";
import { PROCEDURES, procedureTone } from "@/lib/legal";
import { FICHA_FIELDS, VAR_RE, VAR_TYPES, fieldLabel, slugName, type CatalogVariable, type LegalTemplate, type TemplateVariable, type VarType } from "@/lib/templates";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DownloadButton } from "../DownloadButton";
import { deleteTemplate, markVariable, previewValues, removeVariable, saveVariable, updateTemplate } from "../actions";

type Props = {
  template: LegalTemplate;
  doc: DocModel;
  docError: string | null;
  clients: { id: string; full_name: string }[];
  /** Catálogo de variables del estudio: se ofrecen al marcar sin volver a definirlas */
  catalog: CatalogVariable[];
  canEdit: boolean;
  canManage: boolean;
};
type Selection = { p: number; start: number; end: number; text: string; x: number; y: number };
type VarForm = { name: string; label: string; type: VarType; source: string };

const emptyForm = (): VarForm => ({ name: "", label: "", type: "texto", source: "" });
const formOf = (v: TemplateVariable): VarForm => ({ name: v.name, label: v.label, type: v.type, source: v.source ?? "" });

/** Cuenta cuántas veces aparece cada {variable} en el documento. */
function countUses(doc: DocModel) {
  const counts: Record<string, number> = {};
  const visit = (blocks: Block[]) => {
    for (const b of blocks) {
      if (b.kind === "p") for (const m of b.text.matchAll(VAR_RE)) counts[m[1]] = (counts[m[1]] ?? 0) + 1;
      else for (const row of b.rows) for (const cell of row) visit(cell);
    }
  };
  visit(doc.blocks);
  return counts;
}

export function TemplateEditor({ template, doc: initialDoc, docError, clients, catalog, canEdit, canManage }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [doc, setDoc] = useState(initialDoc);
  const [variables, setVariables] = useState(template.variables);
  const [version, setVersion] = useState(template.version);
  const [sel, setSel] = useState<Selection | null>(null);
  const [pick, setPick] = useState<string>("__new"); // variable elegida en el popover (o «__new»)
  const [form, setForm] = useState<VarForm>(emptyForm());
  const [editing, setEditing] = useState<string | null>(null); // variable en edición en el panel (o «__new»)
  const [editForm, setEditForm] = useState<VarForm>(emptyForm());
  const [armed, setArmed] = useState<string | null>(null); // confirmación de quitar variable
  const [mode, setMode] = useState<"marcas" | "datos">("marcas");
  const [clientId, setClientId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState({ name: template.name, description: template.description ?? "", procedure: template.procedure_type ?? "" });
  const [armedDelete, setArmedDelete] = useState(false);
  const docRef = useRef<HTMLDivElement | null>(null);
  const uses = useMemo(() => countUses(doc), [doc]);
  const byName = useMemo(() => new Map(variables.map((v) => [v.name, v])), [variables]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const apply = (r: { error?: string; doc?: DocModel; variables?: TemplateVariable[]; version?: number }, okMsg: string) => {
    if (r.error) return toast(r.error, true), false;
    if (r.doc) setDoc(r.doc);
    if (r.variables) setVariables(r.variables);
    if (r.version) setVersion(r.version);
    toast(okMsg);
    return true;
  };

  /* ---------- Selección de texto en el documento ---------- */

  const locate = (node: Node, offset: number): { p: number; pos: number } | null => {
    const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement))?.closest<HTMLElement>("[data-p]");
    if (!el) return null;
    const p = Number(el.dataset.p);
    const s = Number(el.dataset.s);
    if (node.nodeType === Node.TEXT_NODE) return { p, pos: s + offset };
    return { p, pos: offset === 0 ? s : s + (el.textContent?.length ?? 0) };
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (!canEdit) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return setSel(null);
    const range = selection.getRangeAt(0);
    const a = locate(range.startContainer, range.startOffset);
    const b = locate(range.endContainer, range.endOffset);
    if (!a || !b) return setSel(null);
    if (a.p !== b.p) {
      toast("Selecciona texto dentro de un mismo párrafo.", true);
      return setSel(null);
    }
    const para = findPara(doc.blocks, a.p);
    if (!para) return setSel(null);
    let start = Math.min(a.pos, b.pos);
    let end = Math.max(a.pos, b.pos);
    while (start < end && /\s/.test(para.text[start])) start++;
    while (end > start && /\s/.test(para.text[end - 1])) end--;
    if (end <= start) return setSel(null);
    const text = para.text.slice(start, end);
    if (/[{}]/.test(text)) {
      toast("La selección ya incluye una variable.", true);
      return setSel(null);
    }
    const box = docRef.current?.getBoundingClientRect();
    const x = e.clientX - (box?.left ?? 0);
    const y = e.clientY - (box?.top ?? 0) + (docRef.current?.scrollTop ?? 0);
    const name = slugName(text);
    const field = FICHA_FIELDS.find((f) => f.key === name);
    setForm({ name, label: text.slice(0, 120), type: field?.type ?? "texto", source: field?.key ?? "" });
    setPick(byName.has(name) ? name : "__new");
    setSel({ p: a.p, start, end, text, x, y });
  };

  const mark = () => {
    if (!sel) return;
    const fromCatalog = pick.startsWith("cat:") ? catalog.find((c) => c.name === pick.slice(4)) : undefined;
    const name = pick === "__new" ? form.name.trim() : fromCatalog ? fromCatalog.name : pick;
    start(async () => {
      const r = await markVariable(template.id, {
        p: sel.p,
        start: sel.start,
        end: sel.end,
        name,
        create:
          pick === "__new"
            ? { label: form.label, type: form.type, source: form.source || null }
            : fromCatalog
              ? { label: fromCatalog.label, type: fromCatalog.type, source: fromCatalog.source }
              : undefined,
      });
      if (apply(r, `Marcado como {${name}}`)) {
        setSel(null);
        window.getSelection()?.removeAllRanges();
      }
    });
  };

  /* ---------- Panel de variables ---------- */

  const submitVariable = (oldName: string | null) =>
    start(async () => {
      const r = await saveVariable(template.id, oldName, { name: editForm.name.trim(), label: editForm.label, type: editForm.type, source: editForm.source || null });
      if (apply(r, oldName ? "Variable guardada" : "Variable creada")) setEditing(null);
    });

  const remove = (name: string) =>
    start(async () => {
      const r = await removeVariable(template.id, name);
      if (apply(r, `{${name}} vuelve a ser texto`)) {
        setArmed(null);
        setEditing(null);
      }
    });

  const saveMeta = () =>
    start(async () => {
      const r = await updateTemplate(template.id, { name: meta.name, description: meta.description || null, procedure: meta.procedure || null });
      if (r.error) toast(r.error, true);
      else {
        toast("Plantilla guardada");
        router.refresh();
      }
    });

  const loadValues = (id: string) => {
    setClientId(id);
    if (!id) return setValues({});
    start(async () => {
      const r = await previewValues(id);
      if (r.error || !r.values) toast(r.error ?? "Sin datos", true);
      else setValues(r.values);
    });
  };

  /* ---------- Render del documento ---------- */

  const chip = (name: string, key: string, p: number, s: number) => {
    const v = byName.get(name);
    const src = v?.source ?? null;
    const value = mode === "datos" && clientId ? (src ? values[src] || "" : "") : null;
    const missing = value !== null && !value;
    const title = v ? `${v.label} · ${VAR_TYPES[v.type]} · ${src ? `de la ficha: ${fieldLabel(src)}` : "se pide al generar"}` : `{${name}}: sin definir`;
    return (
      <span
        key={key}
        data-p={p}
        data-s={s}
        title={title}
        className={`mx-[1px] inline rounded-[4px] px-1 py-[1px] font-sans text-[12.5px] font-medium ${
          missing ? "bg-[color:var(--warning-bg)] text-warning" : "bg-[color:var(--surface-active)] text-accent"
        } ${!v ? "outline outline-1 outline-dashed outline-current" : ""}`}
      >
        {value !== null ? value || `[${v?.label ?? name}]` : `{${name}}`}
      </span>
    );
  };

  const renderPara = (p: Para) => {
    const nodes: ReactNode[] = [];
    // Tramos por run y, dentro de cada uno, texto normal o marcador {variable}
    const runs = p.runs.length ? p.runs : p.text ? [{ s: 0, e: p.text.length }] : [];
    for (const r of runs) {
      const style = { fontWeight: r.b ? 700 : undefined, fontStyle: r.i ? "italic" : undefined, textDecoration: r.u ? "underline" : undefined } as const;
      let pos = r.s;
      const slice = p.text.slice(r.s, r.e);
      const re = new RegExp(VAR_RE.source, "g");
      let m: RegExpExecArray | null;
      const pushText = (from: number, to: number) => {
        if (to > from)
          nodes.push(
            <span key={`${p.i}-${from}`} data-p={p.i} data-s={from} style={style}>
              {p.text.slice(from, to)}
            </span>
          );
      };
      while ((m = re.exec(slice))) {
        const at = r.s + m.index;
        pushText(pos, at);
        nodes.push(chip(m[1], `${p.i}-v${at}`, p.i, at));
        pos = at + m[0].length;
      }
      pushText(pos, r.e);
    }
    const align = p.align === "center" ? "text-center" : p.align === "right" ? "text-right" : p.align === "both" ? "text-justify" : "";
    return (
      <p key={p.i} className={`min-h-[1.5em] whitespace-pre-wrap ${align} ${p.heading ? "text-[16px] font-bold" : ""}`}>
        {nodes.length ? nodes : " "}
      </p>
    );
  };

  const renderBlocks = (blocks: Block[]): ReactNode[] =>
    blocks.map((b, i) =>
      b.kind === "p" ? (
        renderPara(b)
      ) : (
        <table key={`t${i}`} className="my-2 w-full border-collapse text-[13px]">
          <tbody>
            {b.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-line px-2 py-1 align-top">
                    {renderBlocks(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    );

  const missingSource = variables.filter((v) => !v.source).length;

  return (
    <>
      {/* Cabecera, como la ficha del cliente */}
      <section className="panel relative z-10 !overflow-visible">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="icon-tile solid">
              <Icon name="folder" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title truncate">{meta.name || template.name}</h1>
                {meta.procedure ? <span className={`tag ${procedureTone(meta.procedure)}`}>{meta.procedure}</span> : <span className="tag">Todos los procedimientos</span>}
                <span className="tag brand">{variables.length} {variables.length === 1 ? "variable" : "variables"}</span>
                <span className="tag">v{version}</span>
              </div>
              <span className="text-[12.5px] text-muted">
                {template.file_name ?? "plantilla.docx"} · {doc.paragraphs} párrafos
                {missingSource > 0 ? ` · ${missingSource} ${missingSource === 1 ? "variable se pide" : "variables se piden"} al generar` : ""}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton id={template.id} className="btn-secondary btn-sm" />
            {canManage && (
              <button
                type="button"
                className="btn-danger btn-sm"
                disabled={pending}
                onBlur={() => setArmedDelete(false)}
                onClick={() =>
                  armedDelete
                    ? start(async () => {
                        const r = await deleteTemplate(template.id);
                        if (r.error) toast(r.error, true);
                        else {
                          toast("Plantilla eliminada");
                          router.push("/plantillas");
                        }
                      })
                    : setArmedDelete(true)
                }
              >
                {armedDelete ? "¿Seguro? Confirmar" : "Eliminar"}
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Documento */}
        <section className="panel">
          <div className="panel-head flex-wrap gap-2">
            <span className="card-title">Documento</span>
            <span className="text-[12px] text-muted">{canEdit ? (mode === "marcas" ? "Selecciona un texto para convertirlo en variable" : "Así quedaría con los datos del cliente") : "Solo lectura"}</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <nav className="seg" aria-label="Modo de vista">
                <button type="button" aria-current={mode === "marcas" ? "true" : undefined} onClick={() => setMode("marcas")}>
                  Marcadores
                </button>
                <button type="button" aria-current={mode === "datos" ? "true" : undefined} onClick={() => setMode("datos")}>
                  Con datos
                </button>
              </nav>
              {mode === "datos" && (
                <select className="input !min-h-[32px] !py-1 text-[12.5px]" value={clientId} onChange={(e) => loadValues(e.target.value)} aria-label="Cliente para la vista previa">
                  <option value="">Elige un cliente…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          {docError ? (
            <div className="px-4 py-6 text-center text-[13px] text-danger">No se pudo leer el Word: {docError}</div>
          ) : (
            <div ref={docRef} className="relative max-h-[calc(100vh-260px)] overflow-auto bg-[color:var(--band)] p-4 sm:p-6" onMouseUp={onMouseUp}>
              <div className="mx-auto max-w-[820px] rounded-md border border-line bg-surface px-8 py-10 font-serif text-[14px] leading-[1.7] text-fg shadow-sm sm:px-14 sm:py-12">
                {doc.blocks.length ? renderBlocks(doc.blocks) : <p className="text-center text-muted">El documento está vacío.</p>}
              </div>
              {sel && (
                <div
                  className="panel absolute z-30 w-[320px] p-3 shadow-lg"
                  style={{ left: Math.min(sel.x, (docRef.current?.clientWidth ?? 800) - 340), top: sel.y + 12 }}
                  role="dialog"
                  aria-label="Convertir en variable"
                  onMouseUp={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 truncate text-[12px] text-muted" title={sel.text}>
                    «{sel.text}»
                  </div>
                  <div className="flex flex-col gap-2">
                    <select className="input" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Variable">
                      <option value="__new">Nueva variable…</option>
                      {variables.length > 0 && (
                        <optgroup label="En esta plantilla">
                          {variables.map((v) => (
                            <option key={v.name} value={v.name}>
                              {`{${v.name}}`} · {v.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {catalog.some((c) => !variables.some((v) => v.name === c.name)) && (
                        <optgroup label="Catálogo del estudio">
                          {catalog
                            .filter((c) => !variables.some((v) => v.name === c.name))
                            .map((c) => (
                              <option key={c.name} value={`cat:${c.name}`}>
                                {`{${c.name}}`} · {c.label}
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </select>
                    {pick === "__new" && (
                      <>
                        <input className="input font-mono text-[12.5px]" value={form.name} onChange={(e) => setForm({ ...form, name: slugName(e.target.value) })} placeholder="nombre_de_la_variable" aria-label="Nombre" />
                        <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Etiqueta" aria-label="Etiqueta" maxLength={120} />
                        <div className="grid grid-cols-2 gap-2">
                          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as VarType })} aria-label="Tipo">
                            {Object.entries(VAR_TYPES).map(([k, l]) => (
                              <option key={k} value={k}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} aria-label="Fuente">
                            <option value="">Se pide al generar</option>
                            {FICHA_FIELDS.map((f) => (
                              <option key={f.key} value={f.key}>
                                Ficha: {f.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}
                    <div className="flex justify-end gap-2">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(null)}>
                        Cancelar
                      </button>
                      <button type="button" className="btn-primary btn-sm" onClick={mark} disabled={pending}>
                        {pending ? "Marcando…" : "Marcar como variable"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Columna derecha: variables y datos de la plantilla */}
        <div className="flex flex-col gap-3">
          <section className="panel">
            <div className="panel-head">
              <span className="card-title">Variables</span>
              {canEdit && (
                <button
                  type="button"
                  className="btn-outline btn-sm ml-auto"
                  onClick={() => {
                    setEditing("__new");
                    setEditForm(emptyForm());
                  }}
                >
                  + Nueva
                </button>
              )}
            </div>
            {editing === "__new" && (
              <div className="border-b border-line-soft px-4 py-3">
                <VariableForm form={editForm} setForm={setEditForm} onSave={() => submitVariable(null)} onCancel={() => setEditing(null)} pending={pending} />
              </div>
            )}
            {variables.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-faint">Sin variables todavía. Selecciona un texto del documento o crea una con «+ Nueva».</div>
            ) : (
              <ul className="flex flex-col">
                {variables.map((v) => (
                  <li key={v.name} className="border-b border-line-soft px-4 py-2.5 last:border-b-0">
                    {editing === v.name ? (
                      <VariableForm form={editForm} setForm={setEditForm} onSave={() => submitVariable(v.name)} onCancel={() => setEditing(null)} pending={pending}>
                        <button
                          type="button"
                          className="btn-ghost btn-sm text-danger"
                          disabled={pending}
                          onBlur={() => setArmed(null)}
                          onClick={() => (armed === v.name ? remove(v.name) : setArmed(v.name))}
                        >
                          {armed === v.name ? "¿Seguro? Quitar" : "Quitar"}
                        </button>
                      </VariableForm>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 text-left"
                        disabled={!canEdit}
                        onClick={() => {
                          setEditing(v.name);
                          setEditForm(formOf(v));
                        }}
                        title={canEdit ? "Editar variable" : undefined}
                      >
                        <span className="flex items-center gap-2">
                          <span className="rounded-[4px] bg-[color:var(--surface-active)] px-1.5 py-[1px] font-mono text-[12px] text-accent">{`{${v.name}}`}</span>
                          <span className="truncate text-[13px] font-medium text-fg">{v.label}</span>
                          <span className={`ml-auto tabnum text-[11.5px] ${uses[v.name] ? "text-muted" : "text-warning"}`}>{uses[v.name] ? `${uses[v.name]} ${uses[v.name] === 1 ? "uso" : "usos"}` : "sin usar"}</span>
                        </span>
                        <span className="text-[11.5px] text-muted">
                          {VAR_TYPES[v.type]} · {v.source ? `de la ficha: ${fieldLabel(v.source)}` : "se pide al generar"}
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="card-title">Plantilla</span>
            </div>
            <div className="flex flex-col gap-3 px-4 py-3">
              <Field label="Nombre">
                <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} maxLength={120} disabled={!canEdit} />
              </Field>
              <Field label="Procedimiento">
                <select className="input" value={meta.procedure} onChange={(e) => setMeta({ ...meta, procedure: e.target.value })} disabled={!canEdit}>
                  <option value="">Todos</option>
                  {PROCEDURES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Descripción">
                <textarea className="input" rows={2} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} maxLength={500} disabled={!canEdit} placeholder="Cuándo se usa este modelo" />
              </Field>
              {canEdit && (
                <div className="flex justify-end">
                  <button type="button" className="btn-primary btn-sm" onClick={saveMeta} disabled={pending}>
                    Guardar
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function findPara(blocks: Block[], index: number): Para | null {
  for (const b of blocks) {
    if (b.kind === "p") {
      if (b.i === index) return b;
    } else {
      for (const row of b.rows) for (const cell of row) {
        const found = findPara(cell, index);
        if (found) return found;
      }
    }
  }
  return null;
}

function VariableForm({ form, setForm, onSave, onCancel, pending, children }: { form: VarForm; setForm: (f: VarForm) => void; onSave: () => void; onCancel: () => void; pending: boolean; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input className="input font-mono text-[12.5px]" value={form.name} onChange={(e) => setForm({ ...form, name: slugName(e.target.value) })} placeholder="nombre_variable" aria-label="Nombre" />
        <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Etiqueta" aria-label="Etiqueta" maxLength={120} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as VarType })} aria-label="Tipo">
          {Object.entries(VAR_TYPES).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} aria-label="Fuente">
          <option value="">Se pide al generar</option>
          {FICHA_FIELDS.map((f) => (
            <option key={f.key} value={f.key}>
              Ficha: {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <button type="button" className="btn-ghost btn-sm ml-auto" onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={onSave} disabled={pending || !form.name}>
          Guardar
        </button>
      </div>
    </div>
  );
}

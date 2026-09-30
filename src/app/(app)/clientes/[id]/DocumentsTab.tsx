"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteDocument, documentUrl, registerDocument, setDocumentStatus, setItemNotApplicable, startChecklist } from "../documents-actions";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { dateTime } from "@/lib/format";
import { DOC_MAX_BYTES, DOC_MIMES, DOC_STATUS } from "@/lib/legal";
import type { ChecklistItem, DocCategory, LegalDocument } from "@/lib/data";

type Props = {
  clientId: string;
  procedure: string | null;
  items: ChecklistItem[];
  docs: LegalDocument[];
  categories: DocCategory[];
  templateCount: number;
  canUpload: boolean;
  canEdit: boolean;
  canEditDocs: boolean;
  canManage: boolean;
  closed: boolean;
  tz: string;
};

const fmtSize = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Pestaña «Documentos»: checklist del procedimiento con subida directa al bucket privado, y otros documentos. */
export function DocumentsTab({ clientId, procedure, items, docs, categories, templateCount, canUpload, canEdit, canEditDocs, canManage, closed, tz }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null); // id del ítem o "otro"
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const byId = new Map(docs.map((d) => [d.id, d]));
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;
  const editable = !closed;
  const done = items.filter((it) => it.satisfied || it.not_applicable).length;
  const others = docs.filter((d) => !d.checklist_item_id && d.is_current);

  const run = (fn: () => Promise<{ error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast(r.error, true);
      else {
        toast(okMsg);
        router.refresh();
      }
    });

  // Subida directa desde el navegador al bucket (no pasa por el servidor); después se registra la fila.
  const upload = async (file: File, itemId: string | null, categoryId: string | null) => {
    if (!(file.type in DOC_MIMES)) return toast("Tipo de archivo no admitido: usa PDF, JPG, PNG, DOC o DOCX.", true);
    if (file.size > DOC_MAX_BYTES) return toast("El archivo supera los 25 MB.", true);
    const key = itemId ?? "otro";
    setUploading(key);
    try {
      const path = `${clientId}/${crypto.randomUUID()}.${DOC_MIMES[file.type]}`;
      const { error } = await createClient().storage.from("legal-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (error) return toast(`No se pudo subir: ${error.message}`, true);
      const name = itemId ? (items.find((it) => it.id === itemId)?.label ?? file.name) : file.name.replace(/\.[a-z0-9]+$/i, "");
      const r = await registerDocument(clientId, { path, name, size: file.size, mime: file.type, checklistItemId: itemId, categoryId });
      if (r.error) toast(r.error, true);
      else {
        toast(itemId ? "Documento recibido" : "Documento subido");
        router.refresh();
      }
    } finally {
      setUploading(null);
    }
  };

  const open = (docId: string) =>
    start(async () => {
      const r = await documentUrl(docId);
      if (r.error || !r.url) toast(r.error ?? "Sin enlace", true);
      else window.open(r.url, "_blank", "noopener");
    });

  const fileInput = (key: string, itemId: string | null, categoryId: string | null) => (
    <input
      ref={(el) => {
        inputs.current[key] = el;
      }}
      type="file"
      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void upload(f, itemId, categoryId);
      }}
    />
  );

  const docLine = (d: LegalDocument) => (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
      <button className="link-muted inline-flex items-center gap-1 text-accent" onClick={() => open(d.id)} disabled={pending} title="Ver o descargar">
        <Icon name="download" size={12} /> {d.name}
      </button>
      <span>
        v{d.version} · {fmtSize(d.file_size)} · {dateTime(d.uploaded_at, tz)}
      </span>
      {canEditDocs && editable ? (
        <select className="input !min-h-[26px] !py-0 text-[12px]" value={d.status} disabled={pending} onChange={(e) => run(() => setDocumentStatus(d.id, clientId, e.target.value), "Estado actualizado")} aria-label="Estado del documento">
          {["recibido", "preparado", "firmado", "presentado"].map((s) => (
            <option key={s} value={s}>
              {DOC_STATUS[s]}
            </option>
          ))}
        </select>
      ) : (
        <span className="tag">{DOC_STATUS[d.status] ?? d.status}</span>
      )}
      {canManage && editable && (
        <button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => run(() => deleteDocument(d.id, clientId), "Documento eliminado")}>
          Eliminar
        </button>
      )}
    </div>
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="panel">
        <div className="panel-head">
          <span className="card-title">Checklist de antecedentes</span>
          <span className="text-[12.5px] text-muted">
            {procedure ?? "Sin procedimiento"}
            {items.length > 0 ? ` · ${done} de ${items.length}` : ""}
          </span>
          {items.length > 0 && (
            <span className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
            </span>
          )}
        </div>
        {items.length === 0 ? (
          <div className="empty">
            <span className="empty-title">{procedure ? `Sin checklist aún para esta causa` : "Define primero el procedimiento"}</span>
            <span className="empty-text">
              {procedure
                ? templateCount > 0
                  ? `El checklist de ${procedure} tiene ${templateCount} antecedentes. Al iniciarlo, cada uno queda pendiente hasta que subas el archivo o lo marques como «no aplica».`
                  : "Este procedimiento todavía no tiene checklist definido."
                : "En Antecedentes, elige el procedimiento para cargar su checklist."}
            </span>
            {procedure && templateCount > 0 && canEdit && editable && (
              <button className="btn-primary" disabled={pending} onClick={() => run(() => startChecklist(clientId), "Checklist creado")}>
                Iniciar checklist
              </button>
            )}
          </div>
        ) : (
          <ol className="flex flex-col">
            {items.map((it) => {
              const d = it.document_id ? byId.get(it.document_id) : undefined;
              const state = it.not_applicable ? "na" : it.satisfied && d ? "ok" : "pending";
              return (
                <li key={it.id} className="flex flex-col gap-1.5 border-b border-line-soft px-5 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        state === "ok" ? "bg-[var(--success-bg)] text-success" : state === "na" ? "bg-surface-2 text-faint" : "bg-[var(--warning-bg)] text-warning"
                      }`}
                      aria-hidden
                    >
                      {state === "ok" ? <Icon name="check" size={13} /> : state === "na" ? "–" : it.position}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className={`text-[13.5px] ${state === "na" ? "text-faint line-through" : "font-medium text-fg"}`}>{it.label}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                        {catName(it.category_id) && <span className="tag">{catName(it.category_id)}</span>}
                        {state === "pending" && <span className="tag warn">Pendiente</span>}
                        {state === "na" && <span className="tag">No aplica</span>}
                      </span>
                    </div>
                    {editable && (
                      <div className="flex items-center gap-1.5">
                        {canUpload && (
                          <>
                            {fileInput(it.id, it.id, it.category_id)}
                            <button className={d ? "btn-outline btn-sm" : "btn-primary btn-sm"} disabled={uploading !== null || pending} onClick={() => inputs.current[it.id]?.click()}>
                              {uploading === it.id ? "Subiendo…" : d ? "Reemplazar" : "Subir"}
                            </button>
                          </>
                        )}
                        {canEdit && !d && (
                          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setItemNotApplicable(it.id, clientId, !it.not_applicable), it.not_applicable ? "Vuelve a exigirse" : "Marcado como no aplica")}>
                            {it.not_applicable ? "Sí aplica" : "No aplica"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {d && <div className="ml-9">{docLine(d)}</div>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <span className="card-title">Otros documentos</span>
          {canUpload && editable && (
            <>
              {fileInput("otro", null, null)}
              <button className="btn-outline btn-sm ml-auto" disabled={uploading !== null || pending} onClick={() => inputs.current["otro"]?.click()}>
                {uploading === "otro" ? "Subiendo…" : "+ Subir"}
              </button>
            </>
          )}
        </div>
        {others.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12.5px] text-faint">Escritos, resoluciones, certificados o cualquier archivo que no esté en el checklist. PDF, imágenes o Word, hasta 25 MB.</div>
        ) : (
          <ul className="flex flex-col">
            {others.map((d) => (
              <li key={d.id} className="border-b border-line-soft px-4 py-3 last:border-b-0">
                {docLine(d)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

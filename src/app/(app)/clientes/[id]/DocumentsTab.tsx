"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteDocument, documentUrl, registerDocument, setDocumentStatus, setItemNotApplicable, startChecklist } from "../documents-actions";
import { linkClientFolder, linkDriveFile } from "../drive-actions";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { dateTime } from "@/lib/format";
import { DOC_MAX_BYTES, DOC_MIMES, DOC_STATUS } from "@/lib/legal";
import type { ChecklistItem, DocCategory, LegalDocument } from "@/lib/data";
import type { ClientDrive } from "@/lib/drive-client";
import type { DriveFile } from "@/lib/google";

type Props = {
  clientId: string;
  procedure: string | null;
  items: ChecklistItem[];
  docs: LegalDocument[];
  categories: DocCategory[];
  templateCount: number;
  drive: ClientDrive | null;
  canUpload: boolean;
  canEdit: boolean;
  canEditDocs: boolean;
  canManage: boolean;
  closed: boolean;
  tz: string;
};

const fmtSize = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const previewUrl = (fileId: string) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
const kindOf = (mime: string) =>
  mime.includes("pdf") ? "PDF" : mime.startsWith("image/") ? "Imagen" : mime.includes("document") || mime.includes("msword") ? "Word" : mime.includes("spreadsheet") || mime.includes("excel") ? "Planilla" : mime.includes("folder") ? "Carpeta" : "Archivo";

/** Pestaña «Documentos»: la carpeta del cliente en el Drive con vista previa, el checklist del procedimiento y otros archivos. */
export function DocumentsTab({ clientId, procedure, items, docs, categories, templateCount, drive, canUpload, canEdit, canEditDocs, canManage, closed, tz }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; name: string; link: string } | null>(null);
  const [linking, setLinking] = useState<DriveFile | null>(null); // archivo del Drive que se está vinculando a un antecedente
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const byId = new Map(docs.map((d) => [d.id, d]));
  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;
  const editable = !closed;
  const done = items.filter((it) => it.satisfied || it.not_applicable).length;
  const others = docs.filter((d) => !d.checklist_item_id && d.is_current);
  const pendingItems = items.filter((it) => !it.satisfied && !it.not_applicable);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const run = (fn: () => Promise<{ error?: string }>, okMsg: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast(r.error, true);
      else {
        toast(okMsg);
        after?.();
        router.refresh();
      }
    });

  // Subida directa desde el navegador al bucket (respaldo cuando no hay Drive); después se registra la fila.
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

  const openDoc = (d: LegalDocument) => {
    if (d.drive_file_id) return setPreview({ id: d.drive_file_id, name: d.name, link: d.drive_link ?? `https://drive.google.com/file/d/${d.drive_file_id}/view` });
    start(async () => {
      const r = await documentUrl(d.id);
      if (r.error || !r.url) toast(r.error ?? "Sin enlace", true);
      else window.open(r.url, "_blank", "noopener");
    });
  };

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
      <button className="link-muted inline-flex items-center gap-1 text-accent" onClick={() => openDoc(d)} disabled={pending} title={d.drive_file_id ? "Vista previa" : "Ver o descargar"}>
        <Icon name={d.drive_file_id ? "eye" : "download"} size={12} /> {d.name}
      </button>
      <span>
        {d.drive_file_id ? "Drive" : fmtSize(d.file_size)} · v{d.version} · {dateTime(d.uploaded_at, tz)}
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
        <button className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => run(() => deleteDocument(d.id, clientId), "Documento quitado")}>
          Quitar
        </button>
      )}
    </div>
  );

  const drivePanel = () => {
    if (!drive || !drive.connected)
      return (
        <div className="px-4 py-6 text-center text-[12.5px] text-faint">
          Google Drive no está conectado. {canManage ? "Conéctalo en Configuración para ver aquí la carpeta del cliente." : "Pídele al administrador que lo conecte en Configuración."}
        </div>
      );
    if (drive.error) return <div className="px-4 py-4 text-[12.5px] text-danger">No se pudo leer el Drive: {drive.error}</div>;
    if (!drive.folder)
      return (
        <div className="flex flex-col gap-3 px-4 py-4">
          <span className="text-[12.5px] text-muted">
            {drive.candidates.length > 0 ? "Hay varias carpetas parecidas en la carpeta raíz. Elige la del cliente:" : drive.configured ? "No se encontró una carpeta con el RUT o el nombre del cliente en la carpeta raíz. Pega el enlace de su carpeta:" : "Falta la carpeta raíz de clientes en Configuración. Mientras tanto, pega el enlace de la carpeta de este cliente:"}
          </span>
          {drive.candidates.map((c) => (
            <button key={c.id} className="btn-outline btn-sm self-start" disabled={pending} onClick={() => run(() => linkClientFolder(clientId, c.webViewLink), `Carpeta vinculada: ${c.name}`)}>
              <Icon name="folder" size={13} /> {c.name}
            </button>
          ))}
          {canEdit && editable && (
            <form action={(fd) => run(() => linkClientFolder(clientId, String(fd.get("url") ?? "")), "Carpeta vinculada")} className="flex flex-wrap gap-2">
              <input name="url" type="url" className="input min-w-[220px] flex-1" placeholder="https://drive.google.com/drive/folders/…" disabled={pending} />
              <button className="btn-primary btn-sm" disabled={pending}>
                Vincular
              </button>
            </form>
          )}
        </div>
      );
    if (drive.files.length === 0) return <div className="px-4 py-6 text-center text-[12.5px] text-faint">La carpeta «{drive.folder.name}» está vacía.</div>;
    return (
      <ul className="flex flex-col">
        {drive.files.map((f) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-2.5 last:border-b-0">
            {f.isFolder ? (
              <a href={f.webViewLink} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-2 text-[13px] font-medium text-fg hover:text-accent">
                <Icon name="folder" size={14} /> <span className="truncate">{f.name}</span>
              </a>
            ) : (
              <button className="inline-flex min-w-0 flex-1 items-center gap-2 text-left text-[13px] font-medium text-fg hover:text-accent" onClick={() => setPreview({ id: f.id, name: f.name, link: f.webViewLink })} title="Vista previa">
                <Icon name="eye" size={14} /> <span className="truncate">{f.name}</span>
              </button>
            )}
            <span className="text-[11.5px] text-muted">
              {kindOf(f.mimeType)}
              {f.size != null ? ` · ${fmtSize(f.size)}` : ""} · {dateTime(f.modifiedTime, tz)}
            </span>
            {!f.isFolder && canUpload && editable && pendingItems.length > 0 && (
              <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setLinking(linking?.id === f.id ? null : f)} title="Marcar un antecedente del checklist como recibido con este archivo">
                Es un antecedente
              </button>
            )}
            {linking?.id === f.id && (
              <select
                className="input !min-h-[28px] !py-0 text-[12px]"
                defaultValue=""
                disabled={pending}
                aria-label="Antecedente del checklist"
                onChange={(e) => {
                  const itemId = e.target.value;
                  if (!itemId) return;
                  const label = items.find((it) => it.id === itemId)?.label ?? f.name;
                  run(() => linkDriveFile(clientId, { fileId: f.id, name: label, mime: f.mimeType, link: f.webViewLink, checklistItemId: itemId }), "Antecedente recibido", () => setLinking(null));
                }}
              >
                <option value="">Elige el antecedente…</option>
                {pendingItems.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.label}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-3">
          <section className="panel">
            <div className="panel-head">
              <span className="card-title">Carpeta del cliente en el Drive</span>
              {drive?.folder && (
                <a href={drive.folder.webViewLink} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
                  <Icon name="external" size={12} /> {drive.folder.name}
                </a>
              )}
            </div>
            {drivePanel()}
          </section>

          <section className="panel">
            <div className="panel-head">
              <span className="card-title">Otros documentos</span>
              {canUpload && editable && (
                <>
                  {fileInput("otro", null, null)}
                  <button className="btn-outline btn-sm ml-auto" disabled={uploading !== null || pending} onClick={() => inputs.current["otro"]?.click()}>
                    {uploading === "otro" ? "Subiendo…" : "+ Subir al almacén"}
                  </button>
                </>
              )}
            </div>
            {others.length === 0 ? (
              <div className="px-4 py-5 text-center text-[12.5px] text-faint">Archivos guardados en el almacén de la app (respaldo cuando no están en el Drive). PDF, imágenes o Word, hasta 25 MB.</div>
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

        <section className="panel">
          <div className="panel-head">
            <span className="card-title">Checklist de antecedentes</span>
            <span className="text-[12.5px] text-muted">
              {procedure ?? "Sin procedimiento"}
              {items.length > 0 ? ` · ${done} de ${items.length}` : ""}
            </span>
          </div>
          {items.length > 0 && (
            <div className="px-4 pt-3">
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
              </span>
            </div>
          )}
          {items.length === 0 ? (
            <div className="empty">
              <span className="empty-title">{procedure ? "Sin checklist aún para esta causa" : "Define primero el procedimiento"}</span>
              <span className="empty-text">
                {procedure
                  ? templateCount > 0
                    ? `El checklist de ${procedure} tiene ${templateCount} antecedentes. Cada uno queda pendiente hasta que lo vincules a un archivo del Drive, subas uno, o lo marques como «no aplica».`
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
                  <li key={it.id} className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          state === "ok" ? "bg-[var(--success-bg)] text-success" : state === "na" ? "bg-surface-2 text-faint" : "bg-[var(--warning-bg)] text-warning"
                        }`}
                        aria-hidden
                      >
                        {state === "ok" ? <Icon name="check" size={13} /> : state === "na" ? "–" : it.position}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className={`text-[13px] ${state === "na" ? "text-faint line-through" : "font-medium text-fg"}`}>{it.label}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                          {catName(it.category_id) && <span className="tag">{catName(it.category_id)}</span>}
                          {state === "pending" && <span className="tag warn">Pendiente</span>}
                          {state === "na" && <span className="tag">No aplica</span>}
                        </span>
                      </div>
                    </div>
                    {editable && (
                      <div className="ml-8 flex flex-wrap items-center gap-1.5">
                        {canUpload && (
                          <>
                            {fileInput(it.id, it.id, it.category_id)}
                            <button className="btn-ghost btn-sm" disabled={uploading !== null || pending} onClick={() => inputs.current[it.id]?.click()} title="Subir al almacén de la app">
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
                    {d && <div className="ml-8">{docLine(d)}</div>}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setPreview(null)} role="dialog" aria-modal="true" aria-label={`Vista previa de ${preview.name}`}>
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{preview.name}</span>
              <a href={preview.link} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
                <Icon name="external" size={13} /> Abrir en Drive
              </a>
              <button className="btn-ghost btn-sm" onClick={() => setPreview(null)} aria-label="Cerrar">
                <Icon name="close" size={14} />
              </button>
            </div>
            <iframe src={previewUrl(preview.id)} title={preview.name} className="h-full w-full flex-1 border-0 bg-surface-2" allow="autoplay" />
          </div>
        </div>
      )}
    </>
  );
}

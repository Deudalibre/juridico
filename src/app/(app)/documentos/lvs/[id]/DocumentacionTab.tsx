"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { documentUrl } from "@/app/(app)/clientes/documents-actions";
import { dateTime } from "@/lib/format";
import { uploadCaseFile } from "@/lib/upload-client";
import { ESTADOS_REQUISITO, estadoTone, resumenRequisitos, vencimiento, type LvsRequisito, type RequisitoEstado } from "@/lib/lvs-requisitos";
import { addRequisitoManual, setRequisito, uploadRequisito } from "../actions";

type Props = { clientId: string; requisitos: LvsRequisito[]; canEdit: boolean; canUpload: boolean; tz: string };

const GRID = "grid min-w-[880px] grid-cols-[minmax(0,2.4fr)_150px_minmax(0,1.4fr)_132px_minmax(0,1.2fr)] items-center gap-x-4";
const fmtDay = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

/**
 * Documentos requeridos del expediente: una fila por documento, con estado, vigencia, archivo y observación.
 * La lista la mantiene la Ficha Maestra (cada «sí» añade lo suyo); aquí se recibe, se revisa y se observa.
 */
export function DocumentacionTab({ clientId, requisitos, canEdit, canUpload, tz }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const r = resumenRequisitos(requisitos);
  const vivos = requisitos.filter((x) => x.estado !== "no_aplica");
  const noAplica = requisitos.filter((x) => x.estado === "no_aplica");

  const run = (fn: () => Promise<{ error?: string }>, okMsg?: string) =>
    start(async () => {
      const res = await fn();
      if (res.error) toast(res.error, true);
      else {
        if (okMsg) toast(okMsg);
        router.refresh();
      }
    });

  const upload = async (req: LvsRequisito, file: File) => {
    setUploading(req.id);
    try {
      const up = await uploadCaseFile(clientId, file);
      const res = await uploadRequisito(clientId, req.id, up);
      if (res.error) toast(res.error, true);
      else {
        toast(`${req.nombre}: recibido`);
        router.refresh();
      }
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setUploading(null);
    }
  };

  const open = (docId: string) =>
    start(async () => {
      const res = await documentUrl(docId);
      if (res.error || !res.url) toast(res.error ?? "Sin enlace", true);
      else window.open(res.url, "_blank", "noopener");
    });

  const row = (q: LvsRequisito) => {
    const v = vencimiento(q);
    const estadoVisible: RequisitoEstado = v?.vencido && (q.estado === "recibido" || q.estado === "por_revisar" || q.estado === "aprobado") ? "vencido" : q.estado;
    return (
      <div key={q.id} className={`${GRID} row min-h-[52px] px-4 py-2`} role="row">
        {/* Documento */}
        <div className="flex min-w-0 flex-col" role="cell">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[13px] font-medium text-fg">{q.nombre}</span>
            {q.generado && <span className="tag shrink-0">Lo genera la app</span>}
            {q.origen === "manual" && <span className="tag shrink-0">Añadido a mano</span>}
          </span>
          {q.regla && <span className="truncate text-[11.5px] text-muted">{q.regla}</span>}
        </div>

        {/* Estado */}
        <div className="flex flex-col gap-1" role="cell">
          {canEdit && !q.generado ? (
            <select
              className={`input !min-h-[28px] !py-0 text-[12px]`}
              value={q.estado}
              disabled={pending}
              onChange={(e) => run(() => setRequisito(clientId, q.id, { estado: e.target.value as RequisitoEstado }), "Estado actualizado")}
              aria-label={`Estado de ${q.nombre}`}
            >
              {(Object.keys(ESTADOS_REQUISITO) as RequisitoEstado[]).map((s) => (
                <option key={s} value={s}>
                  {ESTADOS_REQUISITO[s]}
                </option>
              ))}
            </select>
          ) : (
            <span className={`tag ${estadoTone(estadoVisible)} self-start`}>{ESTADOS_REQUISITO[estadoVisible]}</span>
          )}
          {v?.vencido && q.estado !== "vencido" && q.estado !== "no_aplica" && <span className="text-[11px] text-danger">Vencido desde el {fmtDay(v.limite)}</span>}
        </div>

        {/* Archivo */}
        <div className="flex min-w-0 flex-wrap items-center gap-2" role="cell">
          {q.generado ? (
            <span className="text-[12px] text-faint">Se produce en «Generados»</span>
          ) : (
            <>
              {q.document_id && (
                <button className="link-muted inline-flex items-center gap-1 text-[12.5px] text-accent" onClick={() => open(q.document_id!)} disabled={pending} title="Ver o descargar">
                  <Icon name="download" size={12} /> Ver archivo
                </button>
              )}
              {canUpload && (
                <>
                  <input
                    ref={(el) => {
                      inputs.current[q.id] = el;
                    }}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void upload(q, f);
                    }}
                  />
                  <button className={q.document_id ? "btn-ghost btn-sm" : "btn-outline btn-sm"} disabled={pending || uploading === q.id} onClick={() => inputs.current[q.id]?.click()}>
                    {uploading === q.id ? "Subiendo…" : q.document_id ? "Reemplazar" : "Subir"}
                  </button>
                </>
              )}
              {q.fecha_carga && <span className="text-[11px] text-muted">{dateTime(q.fecha_carga, tz)}</span>}
            </>
          )}
        </div>

        {/* Emisión / vigencia */}
        <div className="flex flex-col gap-0.5" role="cell">
          {q.vigencia_dias ? (
            <>
              <input
                type="date"
                className="input !min-h-[28px] !py-0 text-[12px] tabnum"
                defaultValue={q.fecha_emision ?? ""}
                disabled={!canEdit || pending || q.generado}
                aria-label={`Fecha de emisión de ${q.nombre}`}
                onChange={(e) => run(() => setRequisito(clientId, q.id, { fecha_emision: e.target.value || null }))}
              />
              <span className={`text-[11px] ${v?.vencido ? "text-danger" : "text-muted"}`}>{v ? (v.vencido ? `venció el ${fmtDay(v.limite)}` : `vale hasta el ${fmtDay(v.limite)}`) : `vigencia ${q.vigencia_dias} días`}</span>
            </>
          ) : (
            <span className="text-[11.5px] text-faint">Sin plazo</span>
          )}
        </div>

        {/* Observación */}
        <div role="cell">
          <input
            className="input !min-h-[28px] !py-0 text-[12px]"
            defaultValue={q.observacion ?? ""}
            placeholder="Observación…"
            disabled={!canEdit || pending}
            aria-label={`Observación de ${q.nombre}`}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val !== (q.observacion ?? "")) run(() => setRequisito(clientId, q.id, { observacion: val || null }));
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="panel-head !py-3 flex-wrap gap-x-5 gap-y-2">
          <span className="card-title">Documentación requerida</span>
          <span className="tabnum text-[12.5px] text-soft">
            {r.requeridos} requeridos · <span className="text-success">{r.recibidos} recibidos</span> · <span className="text-warning">{r.pendientes} pendientes</span>
            {r.observados ? <span className="text-danger"> · {r.observados} observados o vencidos</span> : null}
          </span>
          <span className="h-1.5 w-32 overflow-hidden rounded-full" style={{ background: "var(--border)" }} aria-hidden>
            <span className="block h-full rounded-full bar-grow" style={{ width: `${r.pct}%`, background: r.pct === 100 ? "var(--success)" : "var(--brand-dark)" }} />
          </span>
          <span className="tabnum text-[12.5px] font-semibold">{r.pct}%</span>
          <span className="ml-auto text-[12px] text-muted">La lista sale de la Ficha Maestra; las vigencias son las de la NCG 22.</span>
        </div>
        <div className="overflow-x-auto">
          <div className={`${GRID} th-band border-b border-line px-4 py-2`} role="row">
            {["Documento", "Estado", "Archivo", "Emisión / vigencia", "Observación"].map((h, i) => (
              <span key={i} className="th" role="columnheader">
                {h}
              </span>
            ))}
          </div>
          {vivos.length === 0 ? <div className="px-5 py-8 text-center text-[12.5px] text-faint">Completa la Ficha Maestra para que aparezcan los documentos.</div> : vivos.map(row)}
        </div>
        {canEdit && (
          <form
            className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              const nombre = manual.trim();
              if (!nombre) return;
              run(() => addRequisitoManual(clientId, nombre), "Documento añadido");
              setManual("");
            }}
          >
            <Icon name="plus" size={14} />
            <input className="input !min-h-[30px] max-w-[420px] flex-1 text-[12.5px]" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Otro documento que pida el tribunal o el abogado…" disabled={pending} />
            <button className="btn-secondary btn-sm" disabled={pending || !manual.trim()}>
              Añadir
            </button>
          </form>
        )}
      </section>
      {noAplica.length > 0 && (
        <details className="panel px-5 py-3">
          <summary className="cursor-pointer text-[12.5px] text-muted">
            {noAplica.length} {noAplica.length === 1 ? "documento que ya no aplica" : "documentos que ya no aplican"} (según la ficha actual)
          </summary>
          <div className="mt-2 flex flex-col gap-1 text-[12.5px] text-soft">
            {noAplica.map((q) => (
              <span key={q.id}>
                {q.nombre}
                {q.observacion ? <span className="text-faint"> · {q.observacion}</span> : null}
                {canEdit && (
                  <button className="link-muted ml-2 text-accent" disabled={pending} onClick={() => run(() => setRequisito(clientId, q.id, { estado: "pendiente" }), "Documento reactivado")}>
                    volver a pedir
                  </button>
                )}
              </span>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

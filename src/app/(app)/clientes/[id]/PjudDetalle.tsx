"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Dialog";
import { documentoDe, documentosDe, fechaPjud, indexarDocumentos, type Actuacion, type PjudCausaData, type PjudDocumento } from "@/lib/pjud-data";

/**
 * Espejo del modal «Detalle Causa Civil» de la Oficina Judicial Virtual, tal cual se ve en el PJUD: cabecera con los
 * nueve datos, fila de documentos, selector de cuaderno, pestañas (Historia · Litigantes; las demás no se sincronizan)
 * y las tablas con las mismas columnas. Los estilos (.ojv-*) copian Bootstrap 3 como lo usa la OJV. Sin paginación:
 * el PJUD lista todos los folios y el modal se desplaza.
 *
 * Documentos, con los mismos iconos de Font Awesome que la OJV: en «Doc.» el PDF del folio (rojo) y, en los escritos,
 * el certificado de envío (azul); en «Anexo» la carpeta amarilla abre la ventana «Anexo Solicitud» con los adjuntos; en
 * la cabecera, «Anexos de la causa» abre la ventana «Anexo de la Causa». Lo que ya está en Vercel Blob (pjud_documentos)
 * se abre; lo que el PJUD publica y aún no se bajó queda en gris (el PC del estudio lo baja solo).
 */
export function PjudDetalle({ data }: { data: PjudCausaData }) {
  const [cuaderno, setCuaderno] = useState(0);
  const [tab, setTab] = useState<"historia" | "litigantes">("historia");
  const [carpeta, setCarpeta] = useState<{ titulo: string; docs: PjudDocumento[]; pendiente: boolean } | null>(null);
  const cuadernos = data.cuadernos ?? [];
  const actual = cuadernos[cuaderno] ?? cuadernos[0];
  const nombreCuaderno = actual?.nombre ?? "";
  const docs = useMemo(() => indexarDocumentos(data.documentos), [data.documentos]);
  // Orden de cada fila entre las de su mismo folio, en el orden en que lo publica el PJUD (así se guardó en pjud_documentos)
  const { filas, ordenDe } = useMemo(() => {
    const lista = actual?.actuaciones ?? [];
    const vistos = new Map<number, number>();
    const ordenDe = new Map<Actuacion, number>();
    for (const a of lista) {
      if (a.folio == null) continue;
      const n = vistos.get(a.folio) ?? 0;
      vistos.set(a.folio, n + 1);
      ordenDe.set(a, n);
    }
    const filas = lista.slice().sort((a, b) => (b.folio ?? -1) - (a.folio ?? -1) || (ordenDe.get(a) ?? 0) - (ordenDe.get(b) ?? 0));
    return { filas, ordenDe };
  }, [actual]);
  const fecTramite = (registro: string | null, diligencia: string | null) => (registro ? `${fechaPjud(registro)}${diligencia ? ` (${fechaPjud(diligencia)})` : ""}` : diligencia ? fechaPjud(diligencia) : "");
  const anexosCausa = documentosDe(docs, "anexo_causa");

  return (
    <div className="ojv">
      {/* Cabecera: los mismos rótulos y posiciones que el PJUD */}
      <div className="ojv-box">
        <table className="ojv-titulos">
          <tbody>
            <tr>
              <td>
                <strong>ROL:</strong> {data.rol}
              </td>
              <td>
                <strong>F. Ing.:</strong> {fechaPjud(data.fecha_ingreso)}
              </td>
              <td>{data.caratulado}</td>
            </tr>
            <tr>
              <td>
                <strong>Est. Adm.:</strong> {data.estado_adm}
              </td>
              <td>
                <strong>Proc.:</strong> {data.procedimiento}
              </td>
              <td>
                <strong>Ubicación:</strong> {data.ubicacion}
              </td>
            </tr>
            <tr>
              <td>
                <strong>Estado Proc.:</strong> {data.estado_proc}
              </td>
              <td>
                <strong>Etapa:</strong> {data.etapa}
              </td>
              <td>
                <strong>Tribunal:</strong> {data.tribunal}
              </td>
            </tr>
          </tbody>
        </table>
        <table className="ojv-titulos ojv-docs">
          <tbody>
            <tr>
              <td>
                <strong>Texto Demanda:</strong>
                <br />
                <DocIcono doc={documentoDe(docs, "demanda")} titulo="Archivo Texto Demanda" />
              </td>
              <td>
                <strong>Anexos de la causa:</strong>
                <br />
                <CarpetaIcono docs={anexosCausa} titulo="Ver Anexos de la causa" onOpen={() => setCarpeta({ titulo: "Anexo de la Causa", docs: anexosCausa, pendiente: anexosCausa.length === 0 })} />
              </td>
              <td>
                <strong>Certificado de Envío:</strong>
                <br />
                <DocIcono doc={documentoDe(docs, "certificado_demanda")} titulo="Descargar Certificado" />
              </td>
              <td>
                <strong>Ebook:</strong>
                <br />
                <DocIcono doc={documentoDe(docs, "ebook")} titulo="Descargar Ebook" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuaderno y notificaciones */}
      <div className="ojv-box ojv-cuaderno">
        <div>
          <strong>Historia Causa Cuaderno</strong>
          <select className="ojv-select" value={cuaderno} onChange={(e) => setCuaderno(Number(e.target.value))} aria-label="Cuaderno">
            {cuadernos.length === 0 ? <option value={0}>Sin cuadernos</option> : cuadernos.map((c, i) => <option key={i} value={i}>{c.nombre || `Cuaderno ${i + 1}`}</option>)}
          </select>
        </div>
        <div>
          <strong>Información notificaciones receptor:</strong>
          <br />
          <span className="ojv-folder ojv-folder-2x" title="Se consulta en el PJUD">
            <FolderIcon size={28} />
          </span>
        </div>
      </div>

      {/* Pestañas como las de la OJV */}
      <ul className="ojv-tabs" role="tablist">
        <li className={tab === "historia" ? "active" : ""}>
          <button type="button" role="tab" aria-selected={tab === "historia"} onClick={() => setTab("historia")}>
            Historia
          </button>
        </li>
        <li className={tab === "litigantes" ? "active" : ""}>
          <button type="button" role="tab" aria-selected={tab === "litigantes"} onClick={() => setTab("litigantes")}>
            Litigantes
          </button>
        </li>
        {["Notificaciones", "Escritos por Resolver", "Exhortos"].map((t) => (
          <li key={t} className="disabled">
            <button type="button" disabled title="Esta pestaña no se sincroniza; se consulta en el PJUD">
              {t}
            </button>
          </li>
        ))}
      </ul>

      {tab === "historia" ? (
        <table className="ojv-tabla">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Doc.</th>
              <th>Anexo</th>
              <th>Etapa</th>
              <th>Trámite</th>
              <th>Desc. Trámite</th>
              <th>Fec. Trámite</th>
              <th>Foja</th>
              <th>Georref.</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={9} className="ojv-vacio">
                  Este cuaderno no tiene actuaciones
                </td>
              </tr>
            ) : (
              filas.map((a, i) => {
                const folio = a.folio;
                const orden = ordenDe.get(a) ?? 0;
                const anexos = folio == null ? [] : documentosDe(docs, "anexo", nombreCuaderno, folio);
                return (
                  <tr key={`${folio ?? "s"}-${i}`}>
                    <td className="ojv-num">{folio ?? ""}</td>
                    <td className="ojv-doc">
                      {/* Dos huecos fijos: el documento siempre a la izquierda y el certificado de envío a la derecha, alineados fila a fila */}
                      <span className="ojv-doc-huecos">
                        <span>{a.tiene_documento ? <DocIcono doc={folio == null ? undefined : documentoDe(docs, "actuacion", nombreCuaderno, folio, orden)} titulo={a.cert_action ? "Documento principal del escrito" : "Descargar Documento"} /> : folio == null ? <BanIcon /> : null}</span>
                        <span>{a.cert_action && <DocIcono doc={folio == null ? undefined : documentoDe(docs, "certificado", nombreCuaderno, folio, orden)} titulo="Certificado de envío escrito" certificado />}</span>
                      </span>
                    </td>
                    <td className="ojv-doc">
                      {(a.tiene_anexo || anexos.length > 0) && folio != null && (
                        <CarpetaIcono docs={anexos} titulo="Anexo solicitud" onOpen={() => setCarpeta({ titulo: "Anexo Solicitud", docs: anexos, pendiente: anexos.length === 0 })} />
                      )}
                    </td>
                    <td>{a.etapa}</td>
                    <td>{a.tramite}</td>
                    <td>{a.descripcion}</td>
                    <td className="ojv-num">{fecTramite(a.fecha_registro, a.fecha_diligencia)}</td>
                    <td className="ojv-num">{a.foja ?? ""}</td>
                    <td />
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      ) : (
        <table className="ojv-tabla">
          <thead>
            <tr>
              <th>Participante</th>
              <th>Rut</th>
              <th>Persona</th>
              <th>Nombre o Razón Social</th>
            </tr>
          </thead>
          <tbody>
            {(data.partes ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="ojv-vacio">
                  Sin litigantes publicados
                </td>
              </tr>
            ) : (
              (data.partes ?? []).map((p, i) => (
                <tr key={i}>
                  <td>{p.sujeto}</td>
                  <td className="ojv-num">{p.rut}</td>
                  <td>{p.persona}</td>
                  <td>{p.nombre}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* Ventana «Anexo Solicitud» / «Anexo de la Causa», como la de la OJV: Doc. · Fecha · Referencia */}
      {carpeta && (
        <Modal title={carpeta.titulo} onClose={() => setCarpeta(null)} size="lg" hideTitle>
          <div className="ojv-modal ojv-modal-anexo">
            <div className="ojv-modal-head">
              <span className="ojv-modal-titulo">{carpeta.titulo}</span>
              <button type="button" className="ojv-modal-cerrar" onClick={() => setCarpeta(null)} aria-label="Cerrar">
                ×
              </button>
            </div>
            <div className="ojv">
              <div className="ojv-box">
                <table className="ojv-tabla">
                  <thead>
                    <tr>
                      <th>Doc.</th>
                      <th>Fecha</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carpeta.docs.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="ojv-vacio">
                          {carpeta.pendiente ? "Los anexos todavía no se han bajado del PJUD: el PC del estudio los baja solo en la próxima pasada." : "Sin anexos"}
                        </td>
                      </tr>
                    ) : (
                      carpeta.docs.map((d) => (
                        <tr key={d.id}>
                          <td className="ojv-doc">
                            <DocIcono doc={d} titulo="Descargar Documento" />
                          </td>
                          <td className="ojv-num">{fechaPjud(d.fecha)}</td>
                          <td>{d.referencia}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="ojv-modal-pie">
              <span />
              <button type="button" className="btn-secondary btn-sm" onClick={() => setCarpeta(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Icono de PDF como el de la OJV (`fa-file-pdf-o`, rojo; el certificado de envío va azul, `far fa-file-pdf`): bajado →
 * abre el PDF en una pestaña nueva; bajándose o pendiente → gris, con el estado al pasar el ratón.
 */
function DocIcono({ doc, titulo, certificado }: { doc: PjudDocumento | undefined; titulo: string; certificado?: boolean }) {
  const clase = certificado ? "ojv-pdf-cert" : "ojv-pdf";
  if (doc?.estado === "done" && doc.blob_url) {
    return (
      <a href={`/api/pjud/doc/${doc.id}`} target="_blank" rel="noopener noreferrer" className={`ojv-icono ${clase}`} title={`${titulo}${doc.size_bytes ? ` (${Math.round(doc.size_bytes / 1024)} KB)` : ""}`} aria-label={titulo}>
        <PdfIcon />
      </a>
    );
  }
  const estado = doc?.estado === "downloading" ? "Descargando… el PC del estudio lo está bajando" : doc?.estado === "error" ? `PDF pendiente: falló la descarga (${doc.error_msg ?? "error"}); se reintenta sola` : "PDF pendiente: el PC del estudio lo bajará solo";
  return (
    <span className="ojv-icono ojv-espera" title={`${titulo} · ${estado}`} aria-label={`${titulo}: pendiente`}>
      <PdfIcon />
    </span>
  );
}

/** Carpeta amarilla (`fa-folder-open`) que abre la ventana de anexos; en gris si todavía no se bajó ninguno. */
function CarpetaIcono({ docs, titulo, onOpen }: { docs: PjudDocumento[]; titulo: string; onOpen: () => void }) {
  const listos = docs.some((d) => d.estado === "done");
  return (
    <button type="button" className={`ojv-icono ${listos ? "ojv-folder" : "ojv-espera"}`} title={listos ? titulo : `${titulo} · anexos pendientes de bajar`} aria-label={titulo} onClick={onOpen}>
      <FolderOpenIcon />
    </button>
  );
}

/* Iconos de Font Awesome (los mismos que usa la OJV): file-pdf (regular), folder-open y folder (solid), y «no disponible» */
function PdfIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 576 512" fill="currentColor" aria-hidden>
      <path d="M208 48L96 48c-8.8 0-16 7.2-16 16l0 384c0 8.8 7.2 16 16 16l80 0 0 48-80 0c-35.3 0-64-28.7-64-64L32 64C32 28.7 60.7 0 96 0L229.5 0c17 0 33.3 6.7 45.3 18.7L397.3 141.3c12 12 18.7 28.3 18.7 45.3l0 149.5-48 0 0-128-88 0c-39.8 0-72-32.2-72-72l0-88zM348.1 160L256 67.9 256 136c0 13.3 10.7 24 24 24l68.1 0zM240 380l32 0c33.1 0 60 26.9 60 60s-26.9 60-60 60l-12 0 0 28c0 11-9 20-20 20s-20-9-20-20l0-128c0-11 9-20 20-20zm32 80c11 0 20-9 20-20s-9-20-20-20l-12 0 0 40 12 0zm96-80l32 0c28.7 0 52 23.3 52 52l0 64c0 28.7-23.3 52-52 52l-32 0c-11 0-20-9-20-20l0-128c0-11 9-20 20-20zm32 128c6.6 0 12-5.4 12-12l0-64c0-6.6-5.4-12-12-12l-12 0 0 88 12 0zm76-108c0-11 9-20 20-20l48 0c11 0 20 9 20 20s-9 20-20 20l-28 0 0 24 28 0c11 0 20 9 20 20s-9 20-20 20l-28 0 0 44c0 11-9 20-20 20s-20-9-20-20l0-128z" />
    </svg>
  );
}
function FolderOpenIcon() {
  return (
    <svg width="18" height="16" viewBox="0 0 576 512" fill="currentColor" aria-hidden>
      <path d="M56 225.6L32.4 296.2 32.4 96c0-35.3 28.7-64 64-64l138.7 0c13.8 0 27.3 4.5 38.4 12.8l38.4 28.8c5.5 4.2 12.3 6.4 19.2 6.4l117.3 0c35.3 0 64 28.7 64 64l0 16-365.4 0c-41.3 0-78 26.4-91.1 65.6zM477.8 448L99 448c-32.8 0-55.9-32.1-45.5-63.2l48-144C108 221.2 126.4 208 147 208l378.8 0c32.8 0 55.9 32.1 45.5 63.2l-48 144c-6.5 19.6-24.9 32.8-45.5 32.8z" />
    </svg>
  );
}
function FolderIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden>
      <path d="M64 448l384 0c35.3 0 64-28.7 64-64l0-240c0-35.3-28.7-64-64-64L298.7 80c-6.9 0-13.7-2.2-19.2-6.4L241.1 44.8C230 36.5 216.5 32 202.7 32L64 32C28.7 32 0 60.7 0 96L0 384c0 35.3 28.7 64 64 64z" />
    </svg>
  );
}
function BanIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.5 5.5 13 13" />
    </svg>
  );
}

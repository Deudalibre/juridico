"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { listaComoTexto, type DocumentoPlano, type DriveMatch } from "@/lib/lvs-documentos";

type Props = {
  clientId: string;
  docs: DocumentoPlano[];
  /** n → archivo del Drive que parece corresponder */
  drive: Record<number, DriveMatch>;
  driveFolder: { name: string; link: string } | null;
  driveConnected: boolean;
};

/**
 * Recordatorio de lo que lleva la carpeta del cliente: se arma solo desde la ficha (y de los bienes cargados),
 * no se marca nada a mano. Los archivos están en el Drive; si la carpeta está vinculada, se indica cuál ya
 * parece estar, por el nombre del archivo.
 */
export function DocumentacionTab({ clientId, docs, drive, driveFolder, driveConnected }: Props) {
  const [copiado, setCopiado] = useState(false);
  const pedir = docs.filter((d) => !d.generado);
  const genera = docs.filter((d) => d.generado);
  const encontrados = pedir.filter((d) => drive[d.n]).length;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(listaComoTexto(docs));
      setCopiado(true);
      toast("Lista copiada: pégala en el correo o WhatsApp al cliente");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast("No se pudo copiar", true);
    }
  };

  const fila = (d: DocumentoPlano) => {
    const m = drive[d.n];
    return (
      <div key={d.n} className="row flex min-h-[44px] items-center gap-3 px-4 py-2">
        <span className="tabnum w-6 text-[12px] font-semibold text-muted">{d.n}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-fg">{d.nombre}</span>
          {d.nota && <span className={`truncate text-[11.5px] ${/falta/i.test(d.nota) ? "text-warning" : "text-muted"}`}>{d.nota}</span>}
        </span>
        {d.generado ? (
          <Link href={`/documentos/lvs/${clientId}?tab=Generados`} className="tag">
            Lo genera la app
          </Link>
        ) : m ? (
          <a href={m.link} target="_blank" rel="noopener" className="tag success inline-flex max-w-[320px] items-center gap-1" title={m.name}>
            <Icon name="check" size={11} /> <span className="truncate">En Drive · {m.name}</span>
          </a>
        ) : driveFolder ? (
          <span className="tag warn">No se ve en Drive</span>
        ) : null}
      </div>
    );
  };

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="panel-head !py-3 flex-wrap gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col">
            <span className="card-title">Lo que lleva la carpeta</span>
            <span className="text-[12px] text-muted">
              {pedir.length} documentos para pedir o reunir · {genera.length} los genera la app. La lista sale de la ficha; no hay nada que marcar.
              {driveFolder ? ` ${encontrados} de ${pedir.length} ya se reconocen en el Drive por el nombre del archivo.` : ""}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {driveFolder ? (
              <a href={driveFolder.link} target="_blank" rel="noopener" className="btn-outline btn-sm">
                <Icon name="folder" size={13} /> {driveFolder.name}
              </a>
            ) : driveConnected ? (
              <Link href={`/clientes/${clientId}?tab=Documentos`} className="btn-outline btn-sm">
                <Icon name="folder" size={13} /> Vincular carpeta del Drive
              </Link>
            ) : null}
            <button type="button" className="btn-secondary btn-sm" onClick={copiar}>
              <Icon name={copiado ? "check" : "columns"} size={13} /> {copiado ? "Copiada" : "Copiar lista para el cliente"}
            </button>
          </div>
        </div>
        <div className="th-band border-b border-line px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Pedir al cliente o reunir</div>
        {pedir.map(fila)}
        <div className="th-band border-y border-line px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Lo genera la app desde la ficha</div>
        {genera.map(fila)}
      </section>
      <p className="px-1 text-[12px] text-muted">
        Los archivos se guardan en la carpeta del cliente en Drive, como siempre. El reconocimiento por nombre es orientativo: si un archivo se llama de otra forma, aparece como «No se ve en Drive» aunque esté.
      </p>
    </>
  );
}

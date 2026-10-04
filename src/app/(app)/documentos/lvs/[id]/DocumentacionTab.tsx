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
 * Recordatorio sobrio de lo que lleva la carpeta del cliente: se arma solo desde la ficha, no se marca nada ni se
 * exige nada. Una lista corta en dos columnas; si la carpeta del Drive está vinculada, un visto discreto junto a lo
 * que ya parece estar (por el nombre del archivo). Los archivos viven en el Drive, como siempre.
 */
export function DocumentacionTab({ clientId, docs, drive, driveFolder, driveConnected }: Props) {
  const [copiado, setCopiado] = useState(false);
  const pedir = docs.filter((d) => !d.generado);
  const genera = docs.filter((d) => d.generado);

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

  return (
    <details className="fold border border-line-soft" open>
      <summary>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Icon name="folder" size={14} />
          Carpeta del cliente
          <span className="text-xs font-normal text-faint">
            {pedir.length} {pedir.length === 1 ? "documento" : "documentos"} para reunir · la lista sale de la ficha
          </span>
        </span>
        <span className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
          {driveFolder ? (
            <a href={driveFolder.link} target="_blank" rel="noopener" className="btn-ghost btn-sm" title={driveFolder.name}>
              <Icon name="external" size={13} /> Drive
            </a>
          ) : driveConnected ? (
            <Link href={`/clientes/${clientId}?tab=Documentos`} className="btn-ghost btn-sm">
              <Icon name="folder" size={13} /> Vincular Drive
            </Link>
          ) : null}
          <button type="button" className="btn-ghost btn-sm" onClick={copiar}>
            <Icon name={copiado ? "check" : "columns"} size={13} /> {copiado ? "Copiada" : "Copiar lista"}
          </button>
          <span className="chev">›</span>
        </span>
      </summary>
      <div className="fold-body !py-3">
        <ol className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {pedir.map((d) => (
            <li key={d.n} className="flex min-w-0 items-baseline gap-2 text-[12.5px] text-soft">
              <span className="tabnum w-5 shrink-0 text-right text-[11.5px] text-faint">{d.n}.</span>
              <span className="min-w-0 flex-1 truncate">
                {d.nombre}
                {d.nota && <span className="text-faint"> · {d.nota}</span>}
              </span>
              {drive[d.n] && (
                <a href={drive[d.n].link} target="_blank" rel="noopener" className="shrink-0 text-success" title={`En Drive: ${drive[d.n].name}`} aria-label="Ya está en el Drive">
                  <Icon name="check" size={12} />
                </a>
              )}
            </li>
          ))}
        </ol>
        {genera.length > 0 && (
          <p className="mt-3 text-[12px] text-faint">
            Los genera la app desde la ficha: {genera.map((d) => d.nombre.split(" · ")[0]).join(", ")}.
          </p>
        )}
      </div>
    </details>
  );
}

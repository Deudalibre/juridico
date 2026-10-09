"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ContactButtons } from "@/components/ContactButtons";
import { Icon } from "@/components/icons";
import { initials, shortDate } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { CLOSE_TERMINATED, procedureTone } from "@/lib/legal";
import type { LegalClient } from "@/lib/data";
import { LawyerSelect } from "./[id]/LawyerSelect";
import { FichaJuridicaButton } from "./[id]/FichaJuridicaButton";
import { MasColumnasBoton } from "@/components/MasColumnas";

type Member = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
};
type Props = {
  rows: LegalClient[];
  members: Member[];
  canAssign: boolean;
  /** legal.edit: puede «Sincronizar ahora» en la ficha jurídica */
  canEdit: boolean;
  closed: boolean;
  tz: string;
};

// Columnas que truncan texto (cliente, tribunal, abogado) van con minmax(0,…) y recortan por su cuenta; las de
// etiquetas sin salto de línea (procedimiento, rol) conservan el mínimo de contenido.
// La lista es un listado de causas: nombre y antecedentes (procedimiento, rol, tribunal, abogado). El estado, la próxima
// acción y la revisión viven en Revisión, no aquí (pedido del estudio, 2026-10-06).
// Cerradas: 8 columnas; por defecto se ocultan «Abogado» y «Cerrada el» («Más columnas» las despliega)
const GRID_CLOSED = "grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_0.9fr_minmax(0,1.4fr)_1.2fr_404px] group-data-[cols=todas]:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_0.9fr_minmax(0,1.4fr)_1.2fr_minmax(0,1.1fr)_1fr_404px] items-center gap-3";
const EXTRA = "hidden group-data-[cols=todas]:block";
const GRID_ACTIVE = "grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_0.9fr_minmax(0,1.6fr)_minmax(0,1.2fr)_404px] items-center gap-3";

/** Lista de clientes con la misma estructura que «Todos los leads»: filas de 54 px y acciones al final. */
export function ClientsTable({ rows, members, canAssign, canEdit, closed, tz }: Props) {
  const router = useRouter();
  const [todas, setTodas] = useState(false); // cerradas: columnas secundarias desplegadas
  const open = (id: string) => router.push(`/clientes/${id}`);
  const GRID = closed ? GRID_CLOSED : GRID_ACTIVE;
  const headers = closed ? ["Cliente", "Procedimiento", "Rol", "Tribunal", "Motivo de cierre", "Abogado", "Cerrada el", "Acciones"] : ["Cliente", "Procedimiento", "Rol", "Tribunal", "Abogado", "Acciones"];

  return (
    <div role="table" aria-label="Clientes" className={`group ${closed ? "min-w-[1300px]" : "min-w-[1100px]"}`} data-cols={todas ? "todas" : "menos"}>
      {closed && (
        <div className="flex justify-end px-3 py-1">
          <MasColumnasBoton todas={todas} onToggle={() => setTodas((v) => !v)} />
        </div>
      )}
      <div className={`${GRID} th-band border-y border-line px-4 py-2.5`} role="row">
        {headers.map((h) => (
          <div key={h} className={`th ${closed && (h === "Abogado" || h === "Cerrada el") ? EXTRA : ""}`} role="columnheader">
            {h}
          </div>
        ))}
      </div>
      {rows.map((c) => (
        <div key={c.id} className={`${GRID} row min-h-[46px] px-4 py-1`} role="row" tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && open(c.id)}>
          <div className="flex min-w-0 items-center gap-2" role="cell">
            <span className="avatar h-8 w-8 text-[11px]">{initials(c.full_name) || "?"}</span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium leading-4 text-fg">
                {c.internal_number && <span className="tabnum mr-1.5 text-[11px] font-normal text-faint">{c.internal_number}</span>}
                {c.full_name}
              </span>
              <span className="tabnum truncate text-[11px] leading-[14px] text-muted">{c.rut ? formatRut(c.rut) : "RUT pendiente"}</span>
            </span>
          </div>
          <div role="cell" className="truncate text-[12.5px] text-soft">
            {c.procedure_type ? c.procedure_type === "Renegociación" ? <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span> : c.procedure_type : <span className="text-faint">Por definir</span>}
          </div>
          <div role="cell" className="tabnum truncate text-[13px] text-soft">
            {c.rol ?? <span className="tag warn">Sin rol</span>}
          </div>
          <div role="cell" className="truncate text-[12.5px] text-soft">
            {c.tribunal ?? <span className="text-faint">—</span>}
          </div>
          {closed && (
            <div role="cell" className="truncate text-[12.5px] text-soft" title={c.close_detail ?? undefined}>
              {c.close_reason ? <span className={`tag ${c.close_reason === CLOSE_TERMINATED ? "success" : "danger"}`}>{c.close_reason}</span> : <span className="text-faint">—</span>}
            </div>
          )}
          <div role="cell" className={`min-w-0 overflow-hidden ${closed ? EXTRA : ""}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <LawyerSelect clientId={c.id} lawyerId={c.lawyer_id} members={members} canAssign={canAssign && !closed} compact />
          </div>
          {closed && (
            <div role="cell" className={`tabnum text-[12.5px] text-muted ${EXTRA}`}>
              {c.archived_at ? shortDate(c.archived_at, tz) : "—"}
            </div>
          )}
          <div role="cell" className="row-actions flex items-center justify-end gap-1.5 whitespace-nowrap">
            <span className="mr-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <ContactButtons phone={c.phone} name={c.full_name} />
            </span>
            <RowLink icon="folder" label="Carpeta" url={c.drive_folder_url} />
            <span className="contents" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <FichaJuridicaButton variant="row" rol={c.rol} tribunal={c.tribunal} pjudUrl={c.pjud_url} clientId={c.id} canSync={canEdit && !closed} />
            </span>
            <span className="row-view" aria-hidden>
              <Icon name="eye" size={13} /> Ver
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RowLink({ icon, label, url }: { icon: string; label: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="row-view" title={label} onClick={(e) => e.stopPropagation()}>
      <Icon name={icon} size={13} /> {label}
    </a>
  ) : (
    <span className="row-view opacity-50" title={`${label}: sin enlace aún`}>
      <Icon name={icon} size={13} /> {label}
    </span>
  );
}

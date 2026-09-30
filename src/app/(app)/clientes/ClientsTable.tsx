"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { procedureTone } from "@/lib/legal";
import type { LegalClient } from "@/lib/data";
import { LawyerSelect } from "./[id]/LawyerSelect";

type Member = { id: string; full_name: string; email: string; role: string; active: boolean };
type Status = { id: string; name: string };
type Props = { rows: LegalClient[]; members: Member[]; statuses: Status[]; canAssign: boolean };

const GRID = "grid grid-cols-[minmax(0,2fr)_1.1fr_0.9fr_1.2fr_0.9fr_1.1fr_0.8fr_336px] items-center gap-3";
const HEADERS = ["Cliente", "Procedimiento", "Rol", "Tribunal", "Estado", "Abogado", "Ingreso", "Acciones"];

const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : null);

/** Lista de clientes con la misma estructura que «Todos los leads»: filas de 54 px y acciones al final. */
export function ClientsTable({ rows, members, statuses, canAssign }: Props) {
  const router = useRouter();
  const open = (id: string) => router.push(`/clientes/${id}`);
  const statusName = (id: string | null) => statuses.find((s) => s.id === id)?.name ?? null;

  return (
    <div role="table" aria-label="Clientes" className="min-w-[1240px]">
      <div className={`${GRID} th-band border-y border-line px-4 py-2.5`} role="row">
        {HEADERS.map((h) => (
          <div key={h} className="th" role="columnheader">
            {h}
          </div>
        ))}
      </div>
      {rows.map((c) => {
        const status = statusName(c.status_id);
        return (
          <div key={c.id} className={`${GRID} row min-h-[54px] py-1.5`} role="row" tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => e.key === "Enter" && open(c.id)}>
            <div className="flex min-w-0 items-center gap-2" role="cell">
              <span className="avatar h-8 w-8 text-[11px]">{initials(c.full_name) || "?"}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium leading-4 text-fg">{c.full_name}</span>
                <span className="tabnum truncate text-[11px] leading-[14px] text-muted">{c.rut ? formatRut(c.rut) : "RUT pendiente"}</span>
              </span>
            </div>
            <div role="cell">{c.procedure_type ? <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span> : <span className="text-[12.5px] text-faint">—</span>}</div>
            <div role="cell" className="tabnum truncate text-[13px] text-soft">
              {c.rol ?? <span className="tag warn">Sin rol</span>}
            </div>
            <div role="cell" className="truncate text-[12.5px] text-soft">
              {c.tribunal ?? <span className="text-faint">—</span>}
            </div>
            <div role="cell">{status ? <span className="badge neutral">{status}</span> : <span className="text-[12.5px] text-faint">—</span>}</div>
            <div role="cell" className="min-w-0" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <LawyerSelect clientId={c.id} lawyerId={c.lawyer_id} members={members} canAssign={canAssign} compact />
            </div>
            <div role="cell" className="tabnum text-[12.5px] text-muted">
              {fmtDate(c.intake_date) ?? <span className="text-faint">—</span>}
            </div>
            <div role="cell" className="row-actions flex items-center gap-1.5 whitespace-nowrap">
              <RowLink icon="folder" label="Carpeta" url={c.drive_folder_url} />
              <RowLink icon="external" label="Ficha jurídica" url={c.pjud_url} />
              <span className="row-view" aria-hidden>
                <Icon name="eye" size={13} /> Ver
              </span>
              <span className="text-faint" aria-hidden>
                <Icon name="chevron" size={15} />
              </span>
            </div>
          </div>
        );
      })}
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

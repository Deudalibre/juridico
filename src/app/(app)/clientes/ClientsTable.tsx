"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { dueLabel, initials, shortDate } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { CLOSE_TERMINATED, COMPLETED, TASK_KINDS, procedureTone, stepsFor } from "@/lib/legal";
import type { LegalClient, LegalTask } from "@/lib/data";
import { LawyerSelect } from "./[id]/LawyerSelect";

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
  nextTasks: Record<string, LegalTask>;
  canAssign: boolean;
  closed: boolean;
  tz: string;
};

// Columnas que truncan texto (cliente, tribunal, abogado, próxima acción) van con minmax(0,…) y recortan por su cuenta;
// las de etiquetas sin salto de línea (procedimiento, rol, paso, revisada) conservan el mínimo de contenido, así la etiqueta
// ensancha su columna (y la tabla desplaza en horizontal) en vez de montarse sobre la vecina.
const GRID_CLOSED = "grid grid-cols-[minmax(0,2fr)_1.1fr_0.9fr_minmax(0,1.1fr)_1.3fr_minmax(0,1.1fr)_1.3fr_336px] items-center gap-3";
// Activas: además de la próxima acción, cuándo y quién revisó la causa por última vez
const GRID_ACTIVE = "grid grid-cols-[minmax(0,2fr)_1.1fr_0.9fr_minmax(0,1.1fr)_1.3fr_minmax(0,1.1fr)_minmax(0,1.5fr)_1fr_336px] items-center gap-3";

/** Lista de clientes con la misma estructura que «Todos los leads»: filas de 54 px y acciones al final. */
export function ClientsTable({ rows, members, nextTasks, canAssign, closed, tz }: Props) {
  const router = useRouter();
  const open = (id: string) => router.push(`/clientes/${id}`);
  const GRID = closed ? GRID_CLOSED : GRID_ACTIVE;
  const headers = closed
    ? ["Cliente", "Procedimiento", "Rol", "Tribunal", "Motivo de cierre", "Abogado", "Cerrada el", "Acciones"]
    : ["Cliente", "Procedimiento", "Rol", "Tribunal", "Paso", "Abogado", "Próxima acción", "Revisada", "Acciones"];

  return (
    <div role="table" aria-label="Clientes" className={closed ? "min-w-[1300px]" : "min-w-[1440px]"}>
      <div className={`${GRID} th-band border-y border-line px-4 py-2.5`} role="row">
        {headers.map((h) => (
          <div key={h} className="th" role="columnheader">
            {h}
          </div>
        ))}
      </div>
      {rows.map((c) => {
        const step = c.current_step ?? stepsFor(c.procedure_type)[0] ?? null;
        const task = nextTasks[c.id];
        const due = task?.due_at ? dueLabel(task.due_at, tz) : null;
        return (
          <div key={c.id} className={`${GRID} row min-h-[54px] py-1.5`} role="row" tabIndex={0} onClick={() => open(c.id)} onKeyDown={(e) => e.key === "Enter" && open(c.id)}>
            <div className="flex min-w-0 items-center gap-2" role="cell">
              <span className="avatar h-8 w-8 text-[11px]">{initials(c.full_name) || "?"}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium leading-4 text-fg">{c.full_name}</span>
                <span className="tabnum truncate text-[11px] leading-[14px] text-muted">{c.rut ? formatRut(c.rut) : "RUT pendiente"}</span>
              </span>
            </div>
            <div role="cell">
              {c.procedure_type ? <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span> : <span className="text-[12.5px] text-faint">—</span>}
            </div>
            <div role="cell" className="tabnum truncate text-[13px] text-soft">
              {c.rol ?? <span className="tag warn">Sin rol</span>}
            </div>
            <div role="cell" className="truncate text-[12.5px] text-soft">
              {c.tribunal ?? <span className="text-faint">—</span>}
            </div>
            {closed ? (
              <div role="cell" className="truncate text-[12.5px] text-soft" title={c.close_detail ?? undefined}>
                {c.close_reason ? <span className={`tag ${c.close_reason === CLOSE_TERMINATED ? "success" : "danger"}`}>{c.close_reason}</span> : <span className="text-faint">—</span>}
              </div>
            ) : (
              <div role="cell" className="truncate text-[12.5px]">
                {step ? <span className={`tag ${step === COMPLETED ? "success" : "brand"}`}>{step}</span> : <span className="text-faint">Sin procedimiento</span>}
              </div>
            )}
            <div role="cell" className="min-w-0 overflow-hidden" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <LawyerSelect clientId={c.id} lawyerId={c.lawyer_id} members={members} canAssign={canAssign && !closed} compact />
            </div>
            {closed ? (
              <div role="cell" className="tabnum text-[12.5px] text-muted">
                {c.archived_at ? shortDate(c.archived_at, tz) : "—"}
              </div>
            ) : (
              <div role="cell" className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
                {task ? (
                  <>
                    <span className="truncate text-[12.5px] font-medium text-fg" title={task.title}>
                      {task.title}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
                      <span className="truncate">{TASK_KINDS[task.kind] ?? task.kind}</span>
                      {due && <span className={`tag tabnum ${due.overdue ? "danger" : due.today ? "brand" : ""}`}>{due.text}</span>}
                    </span>
                  </>
                ) : (
                  <span className="text-[12.5px] text-faint">—</span>
                )}
              </div>
            )}
            {!closed && (
              <div role="cell" className="flex flex-col items-start gap-0.5 text-[12px]">
                {c.last_review_at ? (
                  <>
                    <span className="tabnum text-soft">{shortDate(c.last_review_at, tz)}</span>
                    {c.next_review_at && Date.parse(c.next_review_at) <= Date.now() ? (
                      <span className="tag warn">Toca revisar</span>
                    ) : (
                      <span className="text-[11px] text-faint">Al día</span>
                    )}
                  </>
                ) : (
                  <span className="tag warn">Nunca</span>
                )}
              </div>
            )}
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

import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getMembers, requirePermission, type CaseStep, type LegalClient, type LegalTask } from "@/lib/data";
import { dateTime, dueLabel, initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { COMPLETED, STEP_RESOLUTION, TASK_KINDS, currentStep, isLiquidacion, procedureTone, stepsFor } from "@/lib/legal";
import { Icon } from "@/components/icons";
import { BasicsForm } from "./BasicsForm";
import { CausaSteps } from "./CausaSteps";
import { ClaveUnica } from "./ClaveUnica";
import { CloseCase } from "./CloseCase";
import { LinksCard } from "./LinksCard";
import { LawyerSelect } from "./LawyerSelect";

// Ficha única del cliente, con la misma estructura que la ficha del lead en el CRM:
// cabecera fija (identidad, etiquetas, acciones), pestañas, y datos a la izquierda con resumen a la derecha.
const TABS = ["Antecedentes", "Causa", "Documentos", "Historial"] as const;

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : null;

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 border-b border-line-soft px-4 py-3 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</span>
      {children}
    </div>
  );
}

function ExternalButton({ icon, label, url }: { icon: string; label: string; url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
      <Icon name={icon} size={14} /> {label}
    </a>
  ) : (
    <Link href="?tab=Antecedentes#enlaces" className="btn-outline btn-sm" title="Aún sin enlace: agrégalo en «Enlaces»">
      <Icon name={icon} size={14} /> {label}
    </Link>
  );
}

export default async function ClientePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { supabase, tz, can } = await requirePermission("legal.view");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [{ data }, members, stepsRes, tasksRes] = await Promise.all([
    supabase.from("legal_clients").select("*").eq("id", params.id).maybeSingle(),
    getMembers(supabase),
    supabase.from("legal_case_steps").select("*").eq("client_id", params.id),
    supabase.from("legal_tasks").select("*").eq("client_id", params.id).order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  if (!data) notFound();
  const c = data as LegalClient;
  const done = (stepsRes.data ?? []) as CaseStep[];
  const tasks = (tasksRes.data ?? []) as LegalTask[];
  const tab = TABS.find((t) => t === searchParams.tab) ?? TABS[0];
  const canEdit = can("legal.edit");
  const closed = Boolean(c.archived_at);
  const steps = stepsFor(c.procedure_type);
  const current = currentStep(c.procedure_type, done.map((d) => d.step));
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name || m.email]));
  const nextTask = tasks.find((t) => t.status === "pendiente");
  const nextDue = nextTask?.due_at ? dueLabel(nextTask.due_at, tz) : null;
  const resolutionDone = done.some((d) => d.step === STEP_RESOLUTION);

  // Qué falta para trabajar la causa (solo datos de esta ficha)
  const missing = [!c.rut && "RUT", !c.phone && !c.email && "contacto", !c.procedure_type && "procedimiento", !c.intake_date && "fecha de ingreso"].filter(Boolean) as string[];

  const summary = (
    <section className="panel">
      <Tile label="Abogado a cargo">
        <LawyerSelect clientId={c.id} lawyerId={c.lawyer_id} members={members} canAssign={can("legal.assign") && !closed} />
      </Tile>
      <Tile label="Contacto">
        {c.phone ? <span className="tabnum text-[13.5px] font-medium">{c.phone}</span> : <span className="text-[13.5px] text-faint">Sin teléfono</span>}
        {c.email ? <span className="truncate text-xs text-muted">{c.email}</span> : <span className="text-xs text-faint">Sin email</span>}
      </Tile>
      <Tile label="Causa">
        {c.rol ? <span className="tabnum text-[13.5px] font-medium">{c.rol}</span> : <span className="tag warn">Sin rol aún</span>}
        {c.tribunal && <span className="text-xs text-muted">{c.tribunal}</span>}
        <span className="text-xs text-muted">{c.intake_date ? `Ingresada el ${fmtDate(c.intake_date)}` : "Sin fecha de ingreso"}</span>
        {c.liquidator_name && <span className="text-xs text-muted">Liquidador: {c.liquidator_name}</span>}
      </Tile>
      <Tile label="Próxima acción">
        {nextTask ? (
          <>
            <span className="text-[13.5px] font-medium">{nextTask.title}</span>
            <span className="text-xs text-muted">
              {TASK_KINDS[nextTask.kind] ?? nextTask.kind}
              {nextDue ? ` · ${nextDue.text}` : ""}
            </span>
          </>
        ) : (
          <Link href={`/clientes/${c.id}?tab=Causa`} className="text-[13.5px] text-faint hover:text-accent">
            Sin tareas pendientes
          </Link>
        )}
      </Tile>
      <Tile label="Clave Única">
        <ClaveUnica clientId={c.id} has={Boolean(c.clave_unica_secret_id)} canEdit={canEdit} />
      </Tile>
      <div id="enlaces">
        <Tile label="Enlaces">
          <LinksCard clientId={c.id} driveUrl={c.drive_folder_url} pjudUrl={c.pjud_url} canEdit={canEdit} />
        </Tile>
      </div>
    </section>
  );

  return (
    <>
      <div className="panel relative z-10 gap-3 px-5 py-4 !overflow-visible">
        <Link href="/clientes" className="link-muted self-start text-xs">
          ← Volver a clientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="avatar h-11 w-11 text-[13px]">{initials(c.full_name) || "?"}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title">{c.full_name}</h1>
                {c.procedure_type && <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span>}
                {closed ? (
                  <span className="tag danger">Cerrada · {c.close_reason ?? "sin motivo"}</span>
                ) : current ? (
                  <span className={`tag ${current === COMPLETED ? "success" : "brand"}`}>{current === COMPLETED ? "Todos los pasos completados" : `Paso: ${current}`}</span>
                ) : null}
                {!closed && isLiquidacion(c.procedure_type) && (resolutionDone && c.liquidation_resolution_at ? (
                  <span className="tag success">Resolución de liquidación · {fmtDate(c.liquidation_resolution_at)}</span>
                ) : (
                  <span className="tag warn">Sin resolución de liquidación aún</span>
                ))}
              </div>
              <span className="text-[13px] text-soft">
                {c.rut ? <span className="tabnum">RUT {formatRut(c.rut)}</span> : <span className="text-warning">RUT pendiente</span>}
                {c.rol && <span className="tabnum"> · {c.rol}</span>}
                {c.tribunal && ` · ${c.tribunal}`}
                {c.last_review_at && ` · última revisión ${dateTime(c.last_review_at, tz)}`}
              </span>
              {closed && c.close_detail && <span className="text-[12.5px] text-muted">{c.close_detail}</span>}
              {!closed && missing.length > 0 && <span className="text-[12.5px] text-warning">Falta: {missing.join(", ")}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExternalButton icon="folder" label="Carpeta del cliente" url={c.drive_folder_url} />
            <ExternalButton icon="external" label="Ficha jurídica" url={c.pjud_url} />
            <CloseCase clientId={c.id} closed={closed} reason={c.close_reason} detail={c.close_detail} canEdit={canEdit} />
          </div>
        </div>
        <nav className="seg self-start" aria-label="Secciones de la ficha">
          {TABS.map((t) => (
            <Link key={t} href={`/clientes/${c.id}?tab=${encodeURIComponent(t)}`} aria-current={tab === t ? "true" : undefined}>
              {t}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "Antecedentes" ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <BasicsForm client={c} canEdit={canEdit && !closed} />
          {summary}
        </div>
      ) : tab === "Causa" ? (
        <CausaSteps
          clientId={c.id}
          procedure={c.procedure_type}
          steps={steps}
          done={done}
          current={current}
          tasks={tasks}
          names={names}
          liquidatorName={c.liquidator_name}
          canEdit={canEdit}
          canTasks={can("legal.tasks")}
          closed={closed}
          tz={tz}
        />
      ) : (
        <section className="panel empty">
          <span className="empty-title">{tab}: llega en la siguiente etapa</span>
          <span className="empty-text">
            {tab === "Documentos" && "Checklist por procedimiento, subida de archivos, estados y versiones; después, generación desde las plantillas Word."}
            {tab === "Historial" && "Cambios de paso, asignaciones, tareas y revisiones de esta causa, en orden."}
          </span>
        </section>
      )}
    </>
  );
}

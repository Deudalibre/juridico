import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, ViewTransition, type ReactNode } from "react";
import Loading from "@/app/(app)/loading";
import {
  getMembers,
  requirePermission,
  type CaseStep,
  type ChecklistItem,
  type DocCategory,
  type LegalClient,
  type LegalDocument,
  type LegalReview,
  type LegalTask,
} from "@/lib/data";
import { dateTime, dueLabel, initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { CHECKLIST_ENABLED, CLOSE_TERMINATED, TASK_KINDS, currentStep, isLiquidacion, isSemaforo, procedureTone, semaforoStyle, stepsFor } from "@/lib/legal";
import { Icon } from "@/components/icons";
import { BasicsForm } from "./BasicsForm";
import { CausaSteps } from "./CausaSteps";
import { PjudFicha } from "./PjudFicha";
import { loadPjud } from "@/lib/pjud-data";
import { ClaveUnica } from "./ClaveUnica";
import { CloseCase } from "./CloseCase";
import { DocumentsTab } from "./DocumentsTab";
import { clientDrive, type ClientDrive } from "@/lib/drive-client";
import { ContactButtons } from "@/components/ContactButtons";
import { LinksCard } from "./LinksCard";
import { LawyerSelect } from "./LawyerSelect";
import { SemaforoPicker } from "./SemaforoPicker";

// Ficha única del cliente, con la misma estructura que la ficha del lead en el CRM:
// cabecera fija (identidad, etiquetas, acciones), pestañas, y datos a la izquierda con resumen a la derecha.
const TABS = ["Antecedentes", "Causa", "Documentos", "Historial"] as const;

const fmtDate = (d: string | null) =>
  d
    ? new Date(`${d}T12:00:00`).toLocaleDateString("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

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

// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Ficha de la causa" };

/**
 * La carga de datos vive en ClienteContent, dentro de un <Suspense> con el esqueleto de loading.tsx: la navegación a la
 * ficha es instantánea (Next 16 lo valida en desarrollo) y los datos entran en streaming. loading.tsx solo cubre la
 * carga directa, no la navegación entre pantallas.
 */
export default function ClientePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ClienteContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ClienteContent(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { supabase, tz, can } = await requirePermission("legal.view");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [{ data }, members, stepsRes, tasksRes, histRes, pjud] = await Promise.all([
    supabase.from("legal_clients").select("*").eq("id", params.id).maybeSingle(),
    getMembers(supabase),
    supabase.from("legal_case_steps").select("*").eq("client_id", params.id),
    supabase.from("legal_tasks").select("*").eq("client_id", params.id).order("due_at", { ascending: true, nullsFirst: false }),
    searchParams.tab === "Historial"
      ? supabase.from("legal_case_history").select("id, at, actor_name, kind, summary").eq("client_id", params.id).order("at", { ascending: false }).limit(200)
      : Promise.resolve({
          data: [] as {
            id: number;
            at: string;
            actor_name: string | null;
            kind: string;
            summary: string | null;
          }[],
        }),
    // Datos del Poder Judicial: solo en la pestaña Causa
    searchParams.tab === "Causa" ? loadPjud(supabase, params.id) : Promise.resolve(null),
  ]);
  const history = (histRes.data ?? []) as {
    id: number;
    at: string;
    actor_name: string | null;
    kind: string;
    summary: string | null;
  }[];
  // Documentos: checklist siempre (para el resumen); archivos, categorías y plantilla solo en su pestaña
  const { data: itemsData } = await supabase.from("legal_checklist_items").select("*").eq("client_id", params.id).order("position");
  const items = (itemsData ?? []) as ChecklistItem[];
  let docs: LegalDocument[] = [];
  let categories: DocCategory[] = [];
  let templateCount = 0;
  let drive: ClientDrive | null = null;
  if (searchParams.tab === "Documentos") {
    const [d, cat, tpl, dr] = await Promise.all([
      supabase.from("legal_documents").select("*").eq("client_id", params.id).order("uploaded_at", { ascending: false }),
      supabase.from("legal_document_categories").select("id, name, position").eq("active", true).order("position"),
      data?.procedure_type
        ? supabase
            .from("legal_checklist_templates")
            .select("id, legal_checklist_template_items(id)")
            .eq("procedure_type", data.procedure_type)
            .eq("active", true)
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      data
        ? clientDrive(supabase, {
            id: data.id,
            full_name: data.full_name,
            rut: data.rut,
            drive_folder_url: data.drive_folder_url,
          })
        : Promise.resolve(null),
    ]);
    drive = dr;
    docs = (d.data ?? []) as LegalDocument[];
    categories = (cat.data ?? []) as DocCategory[];
    const t = tpl.data as {
      legal_checklist_template_items?: { id: string }[];
    } | null;
    templateCount = t?.legal_checklist_template_items?.length ?? 0;
  }
  const docsDone = items.filter((it) => it.satisfied || it.not_applicable).length;
  const { data: lastReviewData } = await supabase.from("legal_reviews").select("*").eq("client_id", params.id).order("reviewed_at", { ascending: false }).limit(1).maybeSingle();
  const lastReview = (lastReviewData ?? null) as LegalReview | null;
  const KIND_LABEL: Record<string, string> = {
    paso: "Paso",
    cierre: "Cierre",
    estado: "Estado",
    abogado: "Abogado",
    revision: "Revisión",
    tarea: "Tarea",
  };
  if (!data) notFound();
  const c = data as LegalClient;
  const done = (stepsRes.data ?? []) as CaseStep[];
  const tasks = (tasksRes.data ?? []) as LegalTask[];
  const tab = TABS.find((t) => t === searchParams.tab) ?? TABS[0];
  const canEdit = can("legal.edit");
  const closed = Boolean(c.archived_at);
  const steps = stepsFor(c.procedure_type);
  const current = currentStep(
    c.procedure_type,
    done.map((d) => d.step),
  );
  const names = Object.fromEntries(members.map((m) => [m.id, m.full_name || m.email]));
  const nextTask = tasks.find((t) => t.status === "pendiente");
  const nextDue = nextTask?.due_at ? dueLabel(nextTask.due_at, tz) : null;

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
        <ContactButtons phone={c.phone} name={c.full_name} variant="labeled" />
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
      <Tile label="Última revisión">
        {lastReview ? (
          <Link href="/revision/historial" className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span className="avatar solid h-7 w-7 shrink-0 text-[10.5px]" aria-hidden>
                {initials(lastReview.reviewer_name ?? "") || "?"}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-[13.5px] font-semibold text-fg">Revisó {lastReview.reviewer_name ?? "sin nombre"}</span>
                <span className="text-xs text-muted">{dateTime(lastReview.reviewed_at, tz)}</span>
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`tag ${lastReview.had_movement ? "brand" : ""}`}>{lastReview.had_movement ? "Con movimiento" : "Sin movimiento"}</span>
              {c.next_review_at && <span className="text-xs text-faint">Próxima: {dueLabel(c.next_review_at, tz).text}</span>}
            </span>
          </Link>
        ) : (
          <Link href="/revision" className="text-[13.5px] text-faint hover:text-accent">
            Nunca revisada
          </Link>
        )}
      </Tile>
      <Tile label="Documentos">
        {!CHECKLIST_ENABLED ? (
          <Link href={`/clientes/${c.id}?tab=Documentos`} className={`text-[13.5px] hover:text-accent ${c.drive_folder_url ? "font-medium text-fg" : "text-faint"}`}>
            {c.drive_folder_url ? "Carpeta del Drive vinculada" : "Carpeta del Drive por vincular"}
          </Link>
        ) : items.length === 0 ? (
          <Link href={`/clientes/${c.id}?tab=Documentos`} className="text-[13.5px] text-faint hover:text-accent">
            Sin checklist aún
          </Link>
        ) : (
          <Link href={`/clientes/${c.id}?tab=Documentos`} className="flex flex-col gap-1">
            <span className={`text-[13.5px] font-medium ${docsDone === items.length ? "text-success" : "text-fg"}`}>
              {docsDone} de {items.length} antecedentes
            </span>
            <span className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span
                className="block h-full rounded-full bg-accent"
                style={{
                  width: `${Math.round((docsDone / items.length) * 100)}%`,
                }}
              />
            </span>
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
      <div className={`panel relative z-10 gap-3 px-5 py-4 !overflow-visible ${!closed && isSemaforo(c.semaforo) ? "sem-row" : ""}`} style={closed ? undefined : semaforoStyle(c.semaforo)}>
        <Link href="/clientes" className="link-muted self-start text-xs">
          ← Volver a clientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="avatar h-11 w-11 text-[13px]">{initials(c.full_name) || "?"}</span>
            <div className="flex min-w-0 flex-col gap-1">
              {/* Cabecera ligera (pedido del estudio, 2026-10-06): nombre, color y procedimiento. El paso, la resolución y la
                  última revisión ya están en el resumen de la derecha; aquí solo estorbaban. */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title">{c.full_name}</h1>
                {!closed && <SemaforoPicker clientId={c.id} value={c.semaforo} canEdit={canEdit} />}
                {c.procedure_type && <span className={`tag ${procedureTone(c.procedure_type)}`}>{c.procedure_type}</span>}
                {closed && (
                  <span className={`tag ${c.close_reason === CLOSE_TERMINATED ? "success" : "danger"}`}>
                    {c.close_reason === CLOSE_TERMINATED ? "Causa terminada" : `Cerrada · ${c.close_reason ?? "sin motivo"}`}
                  </span>
                )}
              </div>
              <span className="text-[13px] text-soft">
                {c.rut ? <span className="tabnum">RUT {formatRut(c.rut)}</span> : <span className="text-warning">RUT pendiente</span>}
                {c.rol && <span className="tabnum"> · {c.rol}</span>}
                {c.tribunal && ` · ${c.tribunal}`}
              </span>
              {closed && c.close_detail && <span className="text-[12.5px] text-muted">{c.close_detail}</span>}
              {!closed && missing.length > 0 && <span className="text-[12.5px] text-warning">Falta: {missing.join(", ")}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLiquidacion(c.procedure_type) && can("documents.view") && (
              <Link href={`/documentos/lvs/${c.id}`} className="btn-outline btn-sm" title="Ficha Maestra, bienes, acreedores y documentos de la solicitud LVS">
                <Icon name="report" size={13} /> Expediente LVS
              </Link>
            )}
            <ExternalButton icon="folder" label="Carpeta del cliente" url={c.drive_folder_url} />
            <ExternalButton icon="external" label="Ficha jurídica" url={c.pjud_url} />
            <CloseCase clientId={c.id} closed={closed} reason={c.close_reason} detail={c.close_detail} canEdit={canEdit} />
          </div>
        </div>
        <nav className="seg self-start" aria-label="Secciones de la ficha">
          {TABS.map((t) => (
            <Link key={t} href={`/clientes/${c.id}?tab=${encodeURIComponent(t)}`} aria-current={tab === t ? "true" : undefined}>
              {/* La pestaña activa lleva la marca compartida: se desliza a la nueva pestaña al cambiar */}
              {tab === t && (
                <ViewTransition name="seg-active" share="nav-marker">
                  <span className="seg-marker" aria-hidden />
                </ViewTransition>
              )}
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
        <>
          <CausaSteps
          clientId={c.id}
          procedure={c.procedure_type}
          steps={steps}
          done={done}
          current={current}
          tasks={tasks}
          names={names}
          liquidatorName={c.liquidator_name}
          filing={{ rol: c.rol, tribunal: c.tribunal, intakeDate: c.intake_date }}
          canEdit={canEdit}
          canTasks={can("legal.tasks")}
          closed={closed}
          tz={tz}
          showSteps={false}
        />
          {/* Réplica de la consulta unificada del Poder Judicial, sincronizada a diario desde el estudio */}
          <PjudFicha data={pjud} rol={c.rol} tribunal={c.tribunal} pjudUrl={c.pjud_url} clientId={c.id} canSync={canEdit} />
        </>
      ) : tab === "Historial" ? (
        <section className="panel overflow-hidden">
          <div className="panel-head">
            <span className="card-title">Historial de la causa</span>
            <span className="text-[12.5px] text-muted">{history.length === 0 ? "Sin movimientos todavía" : `${history.length} movimientos`}</span>
          </div>
          {history.length === 0 ? (
            <div className="px-5 py-6 text-center text-[12.5px] text-faint">Los pasos, cierres, asignaciones y cambios de estado de esta causa aparecerán aquí en orden.</div>
          ) : (
            <ol className="flex flex-col px-5 py-3">
              {/* Línea de tiempo: un punto por movimiento, con el color del tipo */}
              {history.map((h, i) => {
                const dot = h.kind === "cierre" ? "bg-danger" : h.kind === "paso" ? "bg-brand" : h.kind === "revision" ? "bg-accent" : h.kind === "tarea" ? "bg-success" : "bg-line-strong";
                return (
                  <li key={h.id} className="relative flex gap-3 pb-3 pl-5 last:pb-0">
                    {i < history.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-line-soft" aria-hidden />}
                    <span className={`absolute left-0 top-[7px] h-[11px] w-[11px] rounded-full border-2 border-surface ${dot}`} aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[13px] text-fg">{h.summary ?? "—"}</span>
                      <span className="tabnum text-[11.5px] text-muted">
                        {KIND_LABEL[h.kind] ?? h.kind} · {dateTime(h.at, tz)}
                        {h.actor_name ? ` · ${h.actor_name}` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ) : (
        <DocumentsTab
          clientId={c.id}
          procedure={c.procedure_type}
          items={items}
          docs={docs}
          categories={categories}
          templateCount={templateCount}
          drive={drive}
          canUpload={can("documents.upload")}
          canEdit={canEdit}
          canEditDocs={can("documents.edit")}
          canManage={can("documents.manage")}
          closed={closed}
          tz={tz}
        />
      )}
    </>
  );
}

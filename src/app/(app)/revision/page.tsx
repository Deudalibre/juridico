import Link from "next/link";
import type { ReactNode } from "react";
import { getMembers, requirePermission, type LegalClient, type LegalReview, type LegalTask } from "@/lib/data";
import { addDaysKey, dayKey, hourIn, longToday, mondayOf, relativeDays, zonedToIso } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { PROCEDURES, REVIEW_CADENCE, reviewCadence } from "@/lib/legal";
import { Icon } from "@/components/icons";
import { HelpPop } from "@/components/HelpPop";
import { ReviewHeader, ReviewRow } from "./ReviewRow";
import { IngresarDemanda } from "./IngresarDemanda";
import { Filters } from "./Filters";
import { ReviewPicker, type YearSummary } from "./ReviewPicker";
import { WeekCalendar, type CalTask } from "./WeekCalendar";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtKey = (k: string) => `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;
const MONTH_NAMES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Revisión de causas, organizada como el Excel del estudio: por año de ingreso y, dentro, por mes.
// Al entrar se ve el resumen de todos los clientes por año; «Revisar» pide año y mes y muestra solo eso.
// Cada revisión deja registrado si hubo movimiento, la nota, la tarea pendiente, quién revisó y cuándo.

function Group({ title, hint, count, tone, children }: { title: string; hint?: string; count: number; tone?: "danger" | "warning" | "brand" | "success"; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head !py-2.5">
        <span className="card-title">{title}</span>
        <span className={`badge ${tone ?? "neutral"} tabnum`}>{count}</span>
        {hint && <span className="ml-auto text-[12px] text-muted">{hint}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function RevisionPage(props: { searchParams: Promise<{ ver?: string; proc?: string; modo?: string; semana?: string; anio?: string; mes?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, user, profile, tz, can } = await requirePermission("legal.view");
  // Abogados y causas activas a la vez (el filtro por abogado se aplica aquí: son pocas filas y ahorra un viaje)
  const procWanted = (PROCEDURES as readonly string[]).includes(sp.proc ?? "") ? sp.proc! : "";
  let cq = supabase.from("legal_clients").select("*").is("archived_at", null).limit(2000);
  if (procWanted) cq = cq.eq("procedure_type", procWanted);
  const [members, { data: cl, error }] = await Promise.all([getMembers(supabase), cq]);
  if (error) throw new Error(error.message);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const wanted = sp.ver ?? "equipo";
  const view = wanted === "equipo" || wanted === "mios" || lawyers.some((m) => m.id === wanted) ? wanted : "equipo";
  const proc = (PROCEDURES as readonly string[]).includes(sp.proc ?? "") ? sp.proc! : "";
  const modo = sp.modo === "calendario" ? "calendario" : "lista";
  const anio = /^\d{4}$/.test(sp.anio ?? "") ? sp.anio! : "";
  const mes = anio && /^([1-9]|1[0-2])$/.test(sp.mes ?? "") ? Number(sp.mes) : 0;
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({
      ver: view !== "equipo" ? view : undefined,
      proc: proc || undefined,
      anio: anio || undefined,
      mes: mes ? String(mes) : undefined,
      modo: modo === "calendario" ? modo : undefined,
      semana: sp.semana,
      ...patch,
    }).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `/revision?${s}` : "/revision";
  };

  // ---------- Calendario: apercibimientos, audiencias y tareas con fecha, por semana ----------
  let calendar: ReactNode = null;
  if (modo === "calendario") {
    const todayKey = dayKey(new Date(), tz);
    const start = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.semana ?? "") ? sp.semana! : todayKey);
    const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
    let tq = supabase
      .from("legal_tasks")
      .select("id, client_id, kind, title, due_at, status, description, assignee_id, legal_clients!inner(full_name, rol, lawyer_id, archived_at)")
      .in("status", ["pendiente", "completada"])
      .gte("due_at", zonedToIso(`${days[0]}T00:00`, tz)!)
      .lt("due_at", zonedToIso(`${addDaysKey(days[6], 1)}T00:00`, tz)!)
      .order("due_at")
      .limit(1000);
    if (view === "mios") tq = tq.eq("legal_clients.lawyer_id", user.id);
    else if (view !== "equipo") tq = tq.eq("legal_clients.lawyer_id", view);
    const { data: tdata, error: terr } = await tq;
    if (terr) throw new Error(terr.message);
    const nameOfId = new Map(members.map((m) => [m.id, m.full_name || m.email]));
    type Raw = Omit<CalTask, "assignee" | "client"> & { assignee_id: string | null; legal_clients: { full_name: string; rol: string | null } | null };
    const rows = ((tdata ?? []) as unknown as Raw[]).map((t) => ({
      id: t.id,
      client_id: t.client_id,
      kind: t.kind,
      title: t.title,
      due_at: t.due_at,
      status: t.status,
      description: t.description,
      assignee: t.assignee_id ? (nameOfId.get(t.assignee_id) ?? null) : null,
      client: t.legal_clients,
      dayKey: dayKey(t.due_at, tz),
    }));
    calendar = (
      <WeekCalendar
        days={days}
        tasks={rows}
        tz={tz}
        todayKey={todayKey}
        showAssignee={view !== "mios"}
        prevHref={link({ semana: addDaysKey(start, -7) })}
        nextHref={link({ semana: addDaysKey(start, 7) })}
        todayHref={link({ semana: undefined })}
        rangeLabel={`Semana del ${fmtKey(days[0])} al ${fmtKey(days[6])}`}
      />
    );
  }

  const clients = ((cl ?? []) as LegalClient[]).filter((c) => (view === "mios" ? c.lawyer_id === user.id : view === "equipo" ? true : c.lawyer_id === view));
  const ids = clients.map((c) => c.id);

  let tasks: LegalTask[] = [];
  const lastReview = new Map<string, LegalReview>();
  const doneSteps = new Map<string, string[]>(); // pasos hechos por causa: el diálogo ofrece solo los que faltan
  // Las revisiones solo hacen falta para las filas que se van a mostrar (año/mes elegido): la portada no las necesita
  // y así no se traen hasta 3000 filas de toda la cartera en cada carga.
  const shownIds = anio ? clients.filter((c) => c.intake_date?.slice(0, 4) === anio && (!mes || Number(c.intake_date.slice(5, 7)) === mes)).map((c) => c.id) : [];
  if (ids.length > 0) {
    const [t, r, st] = await Promise.all([
      supabase.from("legal_tasks").select("*").in("client_id", ids).eq("status", "pendiente").order("due_at", { ascending: true, nullsFirst: false }),
      shownIds.length > 0
        ? supabase.from("legal_reviews").select("*").in("client_id", shownIds).order("reviewed_at", { ascending: false }).limit(3000)
        : Promise.resolve({ data: [] as LegalReview[] }),
      supabase.from("legal_case_steps").select("client_id, step").in("client_id", ids),
    ]);
    tasks = (t.data ?? []) as LegalTask[];
    for (const rv of (r.data ?? []) as LegalReview[]) if (!lastReview.has(rv.client_id)) lastReview.set(rv.client_id, rv);
    for (const d of (st.data ?? []) as { client_id: string; step: string }[]) doneSteps.set(d.client_id, [...(doneSteps.get(d.client_id) ?? []), d.step]);
  }
  const nextTask = new Map<string, LegalTask>();
  const overdueTasks = new Map<string, LegalTask>();
  const now = Date.now();
  for (const t of tasks) {
    if (!nextTask.has(t.client_id)) nextTask.set(t.client_id, t);
    if (t.due_at && Date.parse(t.due_at) < now && !overdueTasks.has(t.client_id)) overdueTasks.set(t.client_id, t);
  }

  // Orden del estudio (como en su Excel): año de ingreso → mes → número de causa. Sin fecha (en preparación) al final.
  const yearOf = (c: LegalClient) => (c.intake_date ? c.intake_date.slice(0, 4) : "");
  const monthOf = (c: LegalClient) => (c.intake_date ? Number(c.intake_date.slice(5, 7)) : 0);
  const numberOf = (c: LegalClient) => Number(c.internal_number) || Number.MAX_SAFE_INTEGER;
  const chrono = (a: LegalClient, b: LegalClient) =>
    (yearOf(a) || "9999").localeCompare(yearOf(b) || "9999") || monthOf(a) - monthOf(b) || numberOf(a) - numberOf(b) || a.full_name.localeCompare(b.full_name);
  const isPending = (c: LegalClient) => !c.last_review_at || !c.next_review_at || Date.parse(c.next_review_at) <= now;
  const isCritical = (c: LegalClient) => reviewCadence(c.procedure_type, doneSteps.get(c.id) ?? []).critical;

  // Resumen por año (lo primero que se ve): cuántas causas, cuántas por revisar, con tareas vencidas y por mes
  // Los clientes sin fecha de ingreso no son causas en tramitación todavía (no tienen rol): van en «En preparación»,
  // fuera de los años y de la cadencia de revisión, con su propia acción (ingresar la demanda).
  const prep = clients.filter((c) => !c.intake_date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const filed = clients.filter((c) => Boolean(c.intake_date));
  const years = Array.from(new Set(filed.map(yearOf))).sort();
  // Numeración como en el Excel del estudio: dentro de cada mes de ingreso, 1…N por número de causa (estable aunque
  // la causa cambie de grupo: siempre es «la 3 de agosto»). En preparación se numera por orden de alta.
  const seq = new Map<string, number>();
  for (const key of new Set(filed.map((c) => `${yearOf(c)}-${monthOf(c)}`))) {
    filed
      .filter((c) => `${yearOf(c)}-${monthOf(c)}` === key)
      .sort(chrono)
      .forEach((c, i) => seq.set(c.id, i + 1));
  }
  prep.forEach((c, i) => seq.set(c.id, i + 1));
  const summary: YearSummary[] = years.map((y) => {
    const list = clients.filter((c) => yearOf(c) === y);
    const months = Array.from(new Set(list.map(monthOf).filter(Boolean)))
      .sort((a, b) => a - b)
      .map((m) => ({ month: m, total: list.filter((c) => monthOf(c) === m).length, pending: list.filter((c) => monthOf(c) === m && isPending(c)).length }));
    return {
      year: y,
      total: list.length,
      pending: list.filter(isPending).length,
      overdue: list.filter((c) => overdueTasks.has(c.id)).length,
      critical: list.filter(isCritical).length,
      months,
    };
  });
  const totalPending = filed.filter(isPending).length;
  const totalOverdue = filed.filter((c) => overdueTasks.has(c.id)).length;

  // Selección: un año (y opcionalmente un mes)
  const visible = anio ? filed.filter((c) => yearOf(c) === anio && (!mes || monthOf(c) === mes)) : [];
  const queue = visible.filter(isPending).sort(chrono);
  const upToDate = visible.filter((c) => !isPending(c)).sort(chrono);
  const withOverdue = visible.filter((c) => overdueTasks.has(c.id)).sort(chrono);

  const nameOf = (id: string | null) => (id ? (members.find((m) => m.id === id)?.full_name ?? null) : null);
  const showLawyer = view === "equipo";
  const h = hourIn(tz);
  const greeting = h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  const firstName = profile.full_name.split(" ")[0];
  const canReview = can("legal.edit");
  const canTasks = can("legal.tasks");
  const lawyerOpts = lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }));

  const row = (c: LegalClient, task: LegalTask | null) => (
    <ReviewRow
      key={c.id}
      seq={seq.get(c.id) ?? null}
      client={c}
      task={task}
      review={lastReview.get(c.id) ?? null}
      doneSteps={doneSteps.get(c.id) ?? []}
      tz={tz}
      canReview={canReview}
      canTasks={canTasks}
      lawyerName={showLawyer ? (nameOf(c.lawyer_id) ?? "Sin abogado") : null}
      lawyers={lawyerOpts}
      userId={user.id}
    />
  );

  /** Filas con cabecera de columnas y, cuando se ve el año completo, una línea por mes. */
  const table = (list: LegalClient[], taskOf: (c: LegalClient) => LegalTask | null) => {
    const out: ReactNode[] = [<ReviewHeader key="head" />];
    let lastMonth: number | null = null;
    for (const c of list) {
      const m = monthOf(c);
      if (!mes && m !== lastMonth) {
        const n = list.filter((x) => monthOf(x) === m).length;
        out.push(
          <div key={`m-${m}`} className="flex items-center gap-2 border-b border-line-soft bg-surface-2 px-4 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{MONTH_NAMES[m] ?? "Mes"}</span>
            <span className="text-[11px] tabnum text-faint">{n}</span>
          </div>,
        );
        lastMonth = m;
      }
      out.push(row(c, taskOf(c)));
    }
    return out;
  };

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="today" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <span className="page-subtitle">
              {longToday(tz)} · {filed.length} {filed.length === 1 ? "causa" : "causas"} · {totalPending === 0 ? "ninguna por revisar" : `${totalPending} por revisar`}
              {totalOverdue > 0 ? ` · ${totalOverdue} con tareas vencidas` : ""}
              {prep.length > 0 ? ` · ${prep.length} en preparación` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HelpPop label="Cómo funciona" title="Revisión de causas">
            <span>Las causas van por año de ingreso y mes, como las hojas del Excel. Pulsa «Revisar», elige el año y el mes (o todo el año) y aparecen solo esas causas.</span>
            <span>
              La cadencia sale del estado de la causa: sin resolución de liquidación (o sin «Ejecución» en renegociación) se revisa cada {REVIEW_CADENCE.critical} días; con ella,
              cada {REVIEW_CADENCE.settled}. Nadie elige la fecha.
            </span>
            <span>
              Si no pasó nada, «Sin movimiento» lo registra con un clic. Si hubo novedades, «Revisar» pide qué pasó, si avanzó de paso y qué tarea quedó resuelta o pendiente. Todo
              queda con tu nombre, día y hora.
            </span>
          </HelpPop>
          <div className="seg" role="group" aria-label="Vista de Revisión">
            <Link href={link({ modo: undefined, semana: undefined })} aria-current={modo === "lista" ? "true" : undefined}>
              Lista
            </Link>
            <Link href={link({ modo: "calendario" })} aria-current={modo === "calendario" ? "true" : undefined}>
              Calendario
            </Link>
          </div>
          <Filters view={view} proc={proc} anio={anio} mes={mes} lawyers={lawyerOpts} />
          {modo === "lista" && <ReviewPicker summary={summary} anio={anio} mes={mes} base={{ ver: view !== "equipo" ? view : "", proc }} />}
        </div>
      </div>

      {calendar}
      {modo === "calendario" ? null : clients.length === 0 ? (
        <section className="panel empty">
          <span className="icon-tile">
            <Icon name="today" />
          </span>
          <span className="empty-title">{view === "mios" ? "No tienes causas asignadas" : "No hay causas activas"}</span>
          <span className="empty-text">Cuando haya causas en tramitación aparecerán aquí para revisarlas una por una.</span>
        </section>
      ) : !anio ? (
        // Portada: todos los clientes, por año, con sus meses
        <>
          <section className="panel overflow-hidden">
            <div className="panel-head !py-2.5">
              <span className="card-title">Causas en tramitación</span>
              <span className="badge neutral tabnum">{filed.length}</span>
              <span className="ml-auto text-[12px] text-muted">Por año de ingreso. Elige un año y un mes con «Revisar», o muestra un año completo</span>
            </div>
            <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.map((y) => {
                const reviewed = y.total - y.pending;
                const pct = y.total ? Math.round((reviewed / y.total) * 100) : 0;
                return (
                  <div key={y.year} className="lift flex flex-col gap-3 rounded-[var(--r-panel)] border border-line bg-surface px-5 py-4 shadow-[var(--shadow-panel)]">
                    {/* Año, total y la única cifra que importa aquí: cuántas tocan */}
                    <div className="flex items-baseline justify-between gap-3">
                      <Link href={link({ anio: y.year, mes: undefined })} className="page-title !text-[26px] leading-none text-accent hover:underline">
                        {y.year}
                      </Link>
                      <span className="tabnum text-[12.5px] text-soft">
                        <span className={`font-semibold ${y.pending ? "text-warning" : "text-success"}`}>{y.pending}</span> por revisar
                        <span className="text-faint"> · {y.total} en total</span>
                        {y.overdue > 0 && <span className="text-danger"> · {y.overdue} vencidas</span>}
                      </span>
                    </div>
                    <span className="block h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden title={`${reviewed} de ${y.total} al día · ${pct}%`}>
                      <span className="bar-grow block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </span>
                    {/* Solo los meses que tienen causas; el número es lo pendiente */}
                    <div className="flex flex-wrap gap-x-1 gap-y-1">
                      {y.months.map((m) => (
                        <Link
                          key={m.month}
                          href={link({ anio: y.year, mes: String(m.month) })}
                          className="inline-flex items-baseline gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] hover:bg-surface-active"
                          title={`${MONTH_NAMES[m.month]}: ${m.total} causas · ${m.pending} por revisar`}
                        >
                          <span className="text-soft">{MONTH_NAMES[m.month].slice(0, 3)}</span>
                          <span className={`tabnum ${m.pending ? "font-medium text-fg" : "text-success"}`}>{m.pending || "✓"}</span>
                        </Link>
                      ))}
                    </div>
                    <Link href={link({ anio: y.year, mes: undefined })} className="self-end text-[12px] font-medium text-accent hover:underline">
                      Mostrar todo el año →
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Clientes que aún no tienen causa: están preparando documentos y firmas; la demanda no se ha ingresado */}
          {prep.length > 0 && (
            <details className="panel group overflow-hidden" style={{ borderColor: "var(--warning-line)" }}>
              <summary className="panel-head !py-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden" style={{ background: "var(--warning-bg)" }}>
                <span className="card-title">En preparación</span>
                <span className="badge warning tabnum">{prep.length}</span>
                <span className="text-[12px] text-muted">{prep.length === 1 ? "cliente sin rol todavía" : "clientes sin rol todavía"}: se están juntando los documentos y firmas</span>
                <span className="ml-auto text-[12px] font-medium text-accent group-open:hidden">Ver</span>
                <span className="ml-auto hidden text-[12px] font-medium text-accent group-open:inline">Ocultar</span>
              </summary>
              <div className="overflow-x-auto border-t" style={{ borderColor: "var(--warning-line)" }}>
                <div className="grid min-w-[640px] grid-cols-[32px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-x-4 th-band border-b border-line px-4 py-2" role="row">
                  {["N°", "Cliente", "Alta en el sistema", "Abogado", ""].map((h, i) => (
                    <span key={i} className="th" role="columnheader">
                      {h}
                    </span>
                  ))}
                </div>
                {prep.map((c) => (
                  <div key={c.id} className="grid min-w-[640px] grid-cols-[32px_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-x-4 row min-h-[44px] px-4 py-1.5" role="row">
                    <span className="tabnum text-[12px] font-semibold text-muted" role="cell" title={c.internal_number ? `Causa N° ${c.internal_number}` : undefined}>
                      {seq.get(c.id)}
                    </span>
                    <div className="flex min-w-0 items-baseline gap-2" role="cell">
                      <Link href={`/clientes/${c.id}`} className="truncate text-[13px] font-medium text-fg hover:text-accent">
                        {c.full_name}
                      </Link>
                      <span className="tabnum text-[11.5px] text-muted">{c.rut ? formatRut(c.rut) : "RUT pendiente"}</span>
                    </div>
                    <div className="text-[12px] text-soft" role="cell">
                      {relativeDays(c.created_at, tz)}
                    </div>
                    <div className="truncate text-[12px] text-soft" role="cell">
                      {nameOf(c.lawyer_id) ?? <span className="text-faint">Sin abogado</span>}
                    </div>
                    <div className="flex items-center justify-end whitespace-nowrap" role="cell">
                      <IngresarDemanda client={{ id: c.id, full_name: c.full_name, rol: c.rol, tribunal: c.tribunal, intake_date: c.intake_date }} canEdit={canReview} />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      ) : (
        <>
          {/* Barra de la selección: el año, sus meses para saltar entre ellos y la vuelta a todos los clientes */}
          <section className="panel">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="page-title !text-[20px] leading-none">{mes ? `${MONTH_NAMES[mes]} ${anio}` : anio}</span>
                <span className="mt-1 text-[12px] text-muted">
                  {visible.length} {visible.length === 1 ? "causa" : "causas"} · {queue.length} por revisar
                  {withOverdue.length > 0 ? ` · ${withOverdue.length} con tareas vencidas` : ""}
                </span>
              </div>
              {
                <nav className="seg flex-wrap" aria-label="Mes de ingreso">
                  <Link href={link({ mes: undefined })} aria-current={!mes ? "true" : undefined}>
                    Todo el año
                  </Link>
                  {(summary.find((y) => y.year === anio)?.months ?? []).map((m) => (
                    <Link
                      key={m.month}
                      href={link({ mes: String(m.month) })}
                      aria-current={mes === m.month ? "true" : undefined}
                      title={`${m.total} causas · ${m.pending} por revisar`}
                    >
                      {MONTH_NAMES[m.month].slice(0, 3)}
                      <span className={`ml-1 tabnum text-[11px] ${m.pending ? "text-warning" : "text-success"}`}>{m.pending || "✓"}</span>
                    </Link>
                  ))}
                </nav>
              }
              <Link href={link({ anio: undefined, mes: undefined })} className="btn-ghost btn-sm ml-auto">
                ← Todos los clientes
              </Link>
            </div>
          </section>
          {withOverdue.length > 0 && (
            <Group title="Con tareas vencidas" hint="Atiende la tarea o déjala resuelta al revisar" count={withOverdue.length} tone="danger">
              {table(withOverdue, (c) => overdueTasks.get(c.id) ?? null)}
            </Group>
          )}
          <Group title="Por revisar" hint="Numeradas 1…N por mes de ingreso" count={queue.length} tone={queue.length ? "warning" : "success"}>
            {queue.length === 0 ? (
              <div className="px-5 py-6 text-center text-[12.5px] text-faint">Nada pendiente en esta selección.</div>
            ) : (
              table(queue, (c) => nextTask.get(c.id) ?? null)
            )}
          </Group>
          {upToDate.length > 0 && (
            <Group title="Al día" count={upToDate.length} tone="success">
              {table(upToDate, (c) => nextTask.get(c.id) ?? null)}
            </Group>
          )}
        </>
      )}
    </>
  );
}

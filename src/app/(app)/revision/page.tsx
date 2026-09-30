import Link from "next/link";
import type { ReactNode } from "react";
import { getMembers, requirePermission, type LegalClient, type LegalReview, type LegalTask } from "@/lib/data";
import { addDaysKey, dayKey, hourIn, longToday, mondayOf, zonedToIso } from "@/lib/format";
import { PROCEDURES, REVIEW_EVERY_DAYS } from "@/lib/legal";
import { Icon } from "@/components/icons";
import { HelpPop } from "@/components/HelpPop";
import { ReviewRow } from "./ReviewRow";
import { Filters } from "./Filters";
import { WeekCalendar, type CalTask } from "./WeekCalendar";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtKey = (k: string) => `${Number(k.slice(8, 10))} ${MONTHS[Number(k.slice(5, 7)) - 1]}`;

// Revisión de causas: todas las causas activas pasan por aquí una por una. La cola ordena primero las que
// nunca se han revisado (más antiguas primero) y luego las que ya cumplieron su fecha de próxima revisión.
// Cada revisión deja registrado si hubo movimiento, la nota, la tarea pendiente, quién revisó y cuándo.
const LIMIT = 60;

function Group({ title, hint, count, tone, children }: { title: string; hint?: string; count: number; tone?: "danger" | "warning" | "brand" | "success"; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head !py-3">
        <span className="card-title">{title}</span>
        <span className={`badge ${tone ?? "neutral"} tabnum`}>{count}</span>
        {hint && <span className="ml-auto text-[12px] text-muted">{hint}</span>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function RevisionPage(props: { searchParams: Promise<{ ver?: string; proc?: string; modo?: string; semana?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, user, profile, tz, can } = await requirePermission("legal.view");
  const members = await getMembers(supabase);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const wanted = sp.ver ?? "equipo";
  const view = wanted === "equipo" || wanted === "mios" || lawyers.some((m) => m.id === wanted) ? wanted : "equipo";
  const proc = (PROCEDURES as readonly string[]).includes(sp.proc ?? "") ? sp.proc! : "";
  const modo = sp.modo === "calendario" ? "calendario" : "lista";
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ ver: view !== "equipo" ? view : undefined, proc: proc || undefined, modo: modo === "calendario" ? modo : undefined, semana: sp.semana, ...patch }).forEach(([k, v]) => v && p.set(k, v));
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
      assignee: t.assignee_id ? nameOfId.get(t.assignee_id) ?? null : null,
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

  let q = supabase.from("legal_clients").select("*").is("archived_at", null).limit(1000);
  if (view === "mios") q = q.eq("lawyer_id", user.id);
  else if (view !== "equipo") q = q.eq("lawyer_id", view);
  if (proc) q = q.eq("procedure_type", proc);
  const { data: cl, error } = await q;
  if (error) throw new Error(error.message);
  const clients = (cl ?? []) as LegalClient[];
  const ids = clients.map((c) => c.id);

  let tasks: LegalTask[] = [];
  let lastReview = new Map<string, LegalReview>();
  if (ids.length > 0) {
    const [t, r] = await Promise.all([
      supabase.from("legal_tasks").select("*").in("client_id", ids).eq("status", "pendiente").order("due_at", { ascending: true, nullsFirst: false }),
      supabase.from("legal_reviews").select("*").in("client_id", ids).order("reviewed_at", { ascending: false }).limit(3000),
    ]);
    tasks = (t.data ?? []) as LegalTask[];
    for (const rv of (r.data ?? []) as LegalReview[]) if (!lastReview.has(rv.client_id)) lastReview.set(rv.client_id, rv);
  }
  const nextTask = new Map<string, LegalTask>();
  const overdueTasks = new Map<string, LegalTask>();
  const now = Date.now();
  for (const t of tasks) {
    if (!nextTask.has(t.client_id)) nextTask.set(t.client_id, t);
    if (t.due_at && Date.parse(t.due_at) < now && !overdueTasks.has(t.client_id)) overdueTasks.set(t.client_id, t);
  }

  // Cola: nunca revisadas (más antiguas primero) → fecha de revisión cumplida (la más atrasada primero)
  const never = clients.filter((c) => !c.last_review_at).sort((a, b) => (a.intake_date ?? a.created_at).localeCompare(b.intake_date ?? b.created_at));
  const due = clients.filter((c) => c.last_review_at && (!c.next_review_at || Date.parse(c.next_review_at) <= now)).sort((a, b) => (a.next_review_at ?? "").localeCompare(b.next_review_at ?? ""));
  const queue = [...never, ...due];
  const upToDate = clients.filter((c) => c.last_review_at && c.next_review_at && Date.parse(c.next_review_at) > now).sort((a, b) => a.next_review_at!.localeCompare(b.next_review_at!));
  const withOverdue = clients.filter((c) => overdueTasks.has(c.id));

  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? null : null);
  const showLawyer = view === "equipo";
  const h = hourIn(tz);
  const greeting = h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  const firstName = profile.full_name.split(" ")[0];
  const canReview = can("legal.edit");
  const canTasks = can("legal.tasks");

  const rows = (list: LegalClient[]) =>
    list.slice(0, LIMIT).map((c) => (
      <ReviewRow
        key={c.id}
        client={c}
        task={nextTask.get(c.id) ?? null}
        review={lastReview.get(c.id) ?? null}
        tz={tz}
        canReview={canReview}
        canTasks={canTasks}
        lawyerName={showLawyer ? nameOf(c.lawyer_id) ?? "Sin abogado" : null}
        lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))}
        userId={user.id}
      />
    ));
  const more = (n: number) => (n > LIMIT ? <div className="border-t border-line-soft px-5 py-3 text-[12.5px] text-muted">Y {n - LIMIT} más: sigue revisando y se irán mostrando.</div> : null);

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
              {longToday(tz)} · {queue.length === 0 ? "ninguna causa por revisar" : `${queue.length} ${queue.length === 1 ? "causa por revisar" : "causas por revisar"}`}
              {withOverdue.length > 0 ? ` · ${withOverdue.length} con tareas vencidas` : ""}
              {upToDate.length > 0 ? ` · ${upToDate.length} al día` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HelpPop label="Cómo funciona" title="Revisión de causas">
            <span>Cada causa activa vuelve a la cola cuando se cumple su fecha de próxima revisión (por defecto, {REVIEW_EVERY_DAYS} días después de la última).</span>
            <span>Primero van las que nunca se han revisado, de la más antigua a la más nueva por fecha de ingreso; después las más atrasadas.</span>
            <span>Al revisar, anota si hubo movimiento, qué pidió el tribunal y deja la tarea pendiente con responsable y fecha. Todo queda con tu nombre, día y hora.</span>
          </HelpPop>
          <div className="seg" role="group" aria-label="Vista de Revisión">
            <Link href={link({ modo: undefined, semana: undefined })} aria-current={modo === "lista" ? "true" : undefined}>
              Lista
            </Link>
            <Link href={link({ modo: "calendario" })} aria-current={modo === "calendario" ? "true" : undefined}>
              Calendario
            </Link>
          </div>
          <Filters view={view} proc={proc} lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))} />
          <Link href="/revision/historial" className="btn-secondary">
            <Icon name="history" size={14} /> Historial
          </Link>
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
      ) : (
        <>
          {withOverdue.length > 0 && (
            <Group title="Con tareas vencidas" hint="Atiende la tarea o déjala resuelta al revisar" count={withOverdue.length} tone="danger">
              {withOverdue.slice(0, LIMIT).map((c) => (
                <ReviewRow
                  key={c.id}
                  client={c}
                  task={overdueTasks.get(c.id) ?? null}
                  review={lastReview.get(c.id) ?? null}
                  tz={tz}
                  canReview={canReview}
                  canTasks={canTasks}
                  lawyerName={showLawyer ? nameOf(c.lawyer_id) ?? "Sin abogado" : null}
                  lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))}
                  userId={user.id}
                />
              ))}
              {more(withOverdue.length)}
            </Group>
          )}
          <Group title="Por revisar" hint="Primero las que nunca se han revisado, luego las más atrasadas" count={queue.length} tone={queue.length ? "warning" : "success"}>
            {queue.length === 0 ? <div className="px-5 py-6 text-center text-[12.5px] text-faint">Todas las causas están revisadas y al día.</div> : rows(queue)}
            {more(queue.length)}
          </Group>
          {upToDate.length > 0 && (
            <Group title="Al día" hint="Ordenadas por la próxima revisión" count={upToDate.length} tone="success">
              {rows(upToDate)}
              {more(upToDate.length)}
            </Group>
          )}
        </>
      )}
    </>
  );
}

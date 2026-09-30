import Link from "next/link";
import type { ReactNode } from "react";
import { getMembers, requirePermission, type LegalClient, type LegalReview, type LegalTask } from "@/lib/data";
import { hourIn, longToday } from "@/lib/format";
import { PROCEDURES } from "@/lib/legal";
import { Icon } from "@/components/icons";
import { ReviewRow } from "./ReviewRow";
import { Filters } from "./Filters";

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

export default async function RevisionPage(props: { searchParams: Promise<{ ver?: string; proc?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, user, profile, tz, can } = await requirePermission("legal.view");
  const members = await getMembers(supabase);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const wanted = sp.ver ?? "equipo";
  const view = wanted === "equipo" || wanted === "mios" || lawyers.some((m) => m.id === wanted) ? wanted : "equipo";
  const proc = (PROCEDURES as readonly string[]).includes(sp.proc ?? "") ? sp.proc! : "";

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
          <Filters view={view} proc={proc} lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))} />
          <Link href="/revision/historial" className="btn-secondary">
            <Icon name="history" size={14} /> Historial
          </Link>
        </div>
      </div>

      {clients.length === 0 ? (
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

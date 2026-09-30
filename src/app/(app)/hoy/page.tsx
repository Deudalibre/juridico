import Link from "next/link";
import type { ReactNode } from "react";
import { getMembers, requirePermission, type LegalClient, type LegalTask } from "@/lib/data";
import { dayBounds, hourIn, longToday } from "@/lib/format";
import { Icon } from "@/components/icons";
import { TaskRow } from "./TaskRow";

// «Mi día» del abogado, con la misma lógica que Mi día en el CRM: que ninguna causa quede olvidada.
// Grupos por urgencia: vencidas → hoy → esta semana → sin próxima acción → más adelante.
const LIMIT = 40;

function Group({ title, count, tone, children }: { title: string; count: number; tone?: "danger" | "warning" | "brand"; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <div className="panel-head !py-3">
        <span className="card-title">{title}</span>
        <span className={`badge ${tone ?? "neutral"} tabnum`}>{count}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function MiDiaPage(props: { searchParams: Promise<{ ver?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, user, profile, tz, can } = await requirePermission("legal.view");
  // El equipo jurídico es pequeño: por defecto se ve todo el equipo y se puede acotar a «Mis causas» o a un abogado
  const members = await getMembers(supabase);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const wanted = sp.ver ?? "equipo";
  const view = wanted === "equipo" || wanted === "mios" || lawyers.some((m) => m.id === wanted) ? wanted : "equipo";

  let q = supabase.from("legal_clients").select("*").is("archived_at", null).order("updated_at", { ascending: false }).limit(1000);
  if (view === "mios") q = q.eq("lawyer_id", user.id);
  else if (view !== "equipo") q = q.eq("lawyer_id", view);
  const { data: cl, error } = await q;
  if (error) throw new Error(error.message);
  const clients = (cl ?? []) as LegalClient[];
  const byId = new Map(clients.map((c) => [c.id, c]));

  let tasks: LegalTask[] = [];
  if (clients.length > 0) {
    const { data } = await supabase
      .from("legal_tasks")
      .select("*")
      .in("client_id", clients.map((c) => c.id))
      .eq("status", "pendiente")
      .order("due_at", { ascending: true, nullsFirst: false });
    tasks = (data ?? []) as LegalTask[];
  }

  const now = Date.now();
  const { end: endToday } = dayBounds(tz);
  const { end: endWeek } = dayBounds(tz, 6);
  const t = (iso: string) => Date.parse(iso);
  const overdue = tasks.filter((x) => x.due_at && t(x.due_at) < now);
  const today = tasks.filter((x) => x.due_at && t(x.due_at) >= now && t(x.due_at) < t(endToday));
  const week = tasks.filter((x) => x.due_at && t(x.due_at) >= t(endToday) && t(x.due_at) < t(endWeek));
  const later = tasks.filter((x) => !x.due_at || t(x.due_at) >= t(endWeek));
  const withTask = new Set(tasks.map((x) => x.client_id));
  const noAction = clients.filter((c) => !withTask.has(c.id));

  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? null : null);
  const showLawyer = view === "equipo";
  const h = hourIn(tz);
  const greeting = h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
  const firstName = profile.full_name.split(" ")[0];
  const pendingTotal = overdue.length + today.length + noAction.length;
  const canTasks = can("legal.tasks");

  const rows = (list: LegalTask[]) =>
    list.slice(0, LIMIT).map((x) => {
      const c = byId.get(x.client_id);
      return c ? <TaskRow key={x.id} task={x} client={c} tz={tz} canTasks={canTasks} showLawyer={showLawyer ? nameOf(c.lawyer_id) ?? "Sin abogado" : null} /> : null;
    });
  const more = (n: number) => (n > LIMIT ? <div className="border-t border-line-soft px-5 py-3 text-[12.5px] text-muted">Y {n - LIMIT} más.</div> : null);

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
              {longToday(tz)} · {pendingTotal === 0 ? "sin pendientes" : `${pendingTotal} ${pendingTotal === 1 ? "pendiente" : "pendientes"} por atender`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lawyers.length > 0 && (
            <form action="/hoy" className="contents">
              <select name="ver" className="input !min-h-[36px] w-auto" defaultValue={view} aria-label="Ver causas de">
                <option value="equipo">Todo el equipo</option>
                <option value="mios">Mis causas</option>
                {lawyers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
              <button className="btn-outline">Ver</button>
            </form>
          )}
          <Link href="/clientes" className="btn-secondary">
            Todas las causas
          </Link>
        </div>
      </div>

      {tasks.length === 0 && noAction.length === 0 ? (
        <section className="panel empty">
          <span className="icon-tile">
            <Icon name="today" />
          </span>
          <span className="empty-title">{view === "mios" ? "No tienes causas asignadas" : "No hay causas activas"}</span>
          <span className="empty-text">Cuando haya causas con apercibimientos, audiencias o tareas con fecha, aparecerán aquí ordenadas por urgencia.</span>
        </section>
      ) : (
        <>
          {overdue.length > 0 && (
            <Group title="Vencidas" count={overdue.length} tone="danger">
              {rows(overdue)}
              {more(overdue.length)}
            </Group>
          )}
          {today.length > 0 && (
            <Group title="Hoy" count={today.length} tone="brand">
              {rows(today)}
              {more(today.length)}
            </Group>
          )}
          {week.length > 0 && (
            <Group title="Esta semana" count={week.length}>
              {rows(week)}
              {more(week.length)}
            </Group>
          )}
          {noAction.length > 0 && (
            <Group title="Sin próxima acción" count={noAction.length} tone="warning">
              {noAction.slice(0, LIMIT).map((c) => (
                <TaskRow key={c.id} task={null} client={c} tz={tz} canTasks={canTasks} showLawyer={showLawyer ? nameOf(c.lawyer_id) ?? "Sin abogado" : null} />
              ))}
              {more(noAction.length)}
            </Group>
          )}
          {later.length > 0 && (
            <Group title="Más adelante" count={later.length}>
              {rows(later)}
              {more(later.length)}
            </Group>
          )}
        </>
      )}
    </>
  );
}

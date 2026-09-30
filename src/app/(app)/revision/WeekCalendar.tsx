import Link from "next/link";
import { timeOf } from "@/lib/format";
import { TASK_KINDS } from "@/lib/legal";

// Semana de trabajo del área jurídica: apercibimientos, audiencias y tareas con fecha, por día y hora.
// Misma estructura que el calendario de «Mi día» del CRM.
export type CalTask = {
  id: string;
  client_id: string;
  kind: string;
  title: string;
  due_at: string;
  status: "pendiente" | "completada" | "cancelada";
  description: string | null;
  assignee: string | null;
  client: { full_name: string; rol: string | null } | null;
};

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function WeekCalendar({
  days,
  tasks,
  tz,
  todayKey,
  showAssignee,
  prevHref,
  nextHref,
  todayHref,
  rangeLabel,
}: {
  days: string[]; // YYYY-MM-DD en la zona del perfil (lunes a domingo)
  tasks: (CalTask & { dayKey: string })[];
  tz: string;
  todayKey: string;
  showAssignee: boolean;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  rangeLabel: string;
}) {
  const now = Date.now();
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[13.5px] font-semibold text-graphite">{rangeLabel}</span>
        <div className="flex items-center gap-1.5">
          <Link href={prevHref} className="btn-ghost btn-sm" aria-label="Semana anterior">
            ←
          </Link>
          <Link href={todayHref} className="btn-secondary btn-sm">
            Hoy
          </Link>
          <Link href={nextHref} className="btn-ghost btn-sm" aria-label="Semana siguiente">
            →
          </Link>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {days.map((d, i) => {
          const list = tasks.filter((t) => t.dayKey === d).sort((a, b) => a.due_at.localeCompare(b.due_at));
          const isToday = d === todayKey;
          return (
            <div key={d} className="flex min-h-[220px] flex-col gap-1.5 border-b border-r border-line-soft p-2" style={{ background: isToday ? "var(--surface-active)" : undefined }}>
              <div className="flex items-baseline justify-between px-1 pb-1">
                <span className={`text-[12px] font-semibold ${isToday ? "text-accent" : "text-muted"}`}>
                  {DAYS[i]} {Number(d.slice(8, 10))}
                </span>
                {list.length > 0 && <span className="text-[11px] text-faint">{list.length}</span>}
              </div>
              {list.map((t) => {
                const done = t.status === "completada";
                const late = !done && Date.parse(t.due_at) < now;
                const hearing = t.kind === "audiencia" || t.kind === "apercibimiento";
                return (
                  <Link
                    key={t.id}
                    href={`/clientes/${t.client_id}?tab=Causa`}
                    className="flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-fg hover:text-fg"
                    style={{
                      borderColor: late ? "var(--danger-line)" : hearing ? "var(--brand-primary)" : "var(--border)",
                      background: done ? "var(--surface-secondary)" : "var(--surface)",
                      opacity: done ? 0.65 : 1,
                    }}
                    title={t.description ?? undefined}
                  >
                    <span className="flex items-center gap-1 text-[11.5px] font-semibold">
                      <span className={late ? "text-danger" : "text-accent"}>{timeOf(t.due_at, tz)}</span>
                      {done && <span className="text-success">✓</span>}
                    </span>
                    <span className={`truncate text-[12.5px] font-medium ${done ? "line-through" : ""}`}>{t.client?.full_name ?? "Causa"}</span>
                    <span className="truncate text-[11.5px] text-muted">{t.title}</span>
                    <span className="truncate text-[11px] font-semibold text-accent">{TASK_KINDS[t.kind] ?? t.kind}</span>
                    {showAssignee && <span className="truncate text-[11px] text-faint">{t.assignee ?? "Sin responsable"}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

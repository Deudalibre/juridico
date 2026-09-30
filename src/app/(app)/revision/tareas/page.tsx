import Link from "next/link";
import { getMembers, requirePermission, type LegalTask } from "@/lib/data";
import { dateTime, initials } from "@/lib/format";
import { TASK_KINDS } from "@/lib/legal";
import { Icon } from "@/components/icons";
import { ExportButton } from "@/components/ExportButton";
import { HelpPop } from "@/components/HelpPop";
import { TasksFilters } from "./TasksFilters";

// Supervisión de tareas cerradas: qué se completó o canceló, quién, cuándo, con qué resultado y si fue a tiempo.
// Señala los cierres «en ráfaga» (varias tareas de la misma persona en pocos minutos) sin bloquear nada.
const BURST_COUNT = 5; // cierres…
const BURST_MINUTES = 10; // …en esta ventana
const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
const DAY = 86400_000;

type Row = LegalTask & { canceled_at: string | null; closed_by: string | null; legal_clients: { full_name: string; rol: string | null } | null };

export default async function TareasCerradasPage(props: { searchParams: Promise<{ quien?: string; desde?: string; hasta?: string; q?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, tz } = await requirePermission("legal.view");
  const members = await getMembers(supabase);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const quien = lawyers.some((m) => m.id === sp.quien) ? sp.quien! : "";
  const desde = isDate(sp.desde) ? sp.desde! : "";
  const hasta = isDate(sp.hasta) ? sp.hasta! : "";

  let q = supabase
    .from("legal_tasks")
    .select("*, legal_clients(full_name, rol)")
    .in("status", ["completada", "cancelada"])
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (quien) q = q.eq("closed_by", quien);
  if (desde) q = q.gte("completed_at", `${desde}T00:00:00`);
  if (hasta) q = q.lte("completed_at", `${hasta}T23:59:59`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const term = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? null : null);
  const closedAt = (t: Row) => t.completed_at ?? t.canceled_at ?? t.created_at;
  const rows = ((data ?? []) as unknown as Row[])
    .filter((t) => !term || (t.legal_clients?.full_name ?? "").toLowerCase().includes(term) || t.title.toLowerCase().includes(term) || (t.result ?? "").toLowerCase().includes(term))
    .sort((a, b) => closedAt(b).localeCompare(closedAt(a)));

  // Ráfagas: BURST_COUNT o más cierres de la misma persona dentro de BURST_MINUTES
  const burst = new Set<string>();
  const byCloser = new Map<string, Row[]>();
  for (const t of rows) if (t.closed_by) byCloser.set(t.closed_by, [...(byCloser.get(t.closed_by) ?? []), t]);
  for (const list of byCloser.values()) {
    const sorted = [...list].sort((a, b) => closedAt(a).localeCompare(closedAt(b)));
    for (let i = 0; i + BURST_COUNT - 1 < sorted.length; i++) {
      const j = i + BURST_COUNT - 1;
      if (Date.parse(closedAt(sorted[j])) - Date.parse(closedAt(sorted[i])) <= BURST_MINUTES * 60_000) for (let k = i; k <= j; k++) burst.add(sorted[k].id);
    }
  }

  // Resumen por persona: cuántas cerró, cuántas fuera de plazo, cuántas en ráfaga
  const summary = [...byCloser.entries()]
    .map(([id, list]) => ({
      id,
      name: nameOf(id) ?? "Sin nombre",
      total: list.length,
      late: list.filter((t) => t.status === "completada" && t.due_at && Date.parse(closedAt(t)) > Date.parse(t.due_at) + DAY).length,
      canceled: list.filter((t) => t.status === "cancelada").length,
      burst: list.filter((t) => burst.has(t.id)).length,
    }))
    .sort((a, b) => b.total - a.total);

  const timing = (t: Row) => {
    if (!t.due_at || t.status !== "completada") return null;
    const diff = Math.round((Date.parse(closedAt(t)) - Date.parse(t.due_at)) / DAY);
    if (diff <= 0) return { text: "A tiempo", tone: "success" };
    return { text: diff === 1 ? "1 día tarde" : `${diff} días tarde`, tone: "danger" };
  };

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="check" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Tareas cerradas</h1>
            <span className="page-subtitle">
              {rows.length} {rows.length === 1 ? "cierre" : "cierres"}
              {quien ? ` de ${nameOf(quien) ?? "…"}` : " del equipo"}
              {burst.size > 0 ? ` · ${burst.size} en ráfaga` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HelpPop label="Cómo se lee" title="Supervisión de tareas">
            <span>Cada cierre guarda quién lo hizo, cuándo y el resultado que anotó. Lo mismo queda en el historial de la causa.</span>
            <span>
              «En ráfaga» marca {BURST_COUNT} o más cierres de la misma persona en menos de {BURST_MINUTES} minutos: no es una falta, pero conviene mirar los resultados.
            </span>
            <span>«Tarde» compara la fecha de cierre con el vencimiento de la tarea (con un día de margen).</span>
          </HelpPop>
          <form action="/revision/tareas" className="contents" role="search">
            {quien && <input type="hidden" name="quien" value={quien} />}
            {desde && <input type="hidden" name="desde" value={desde} />}
            {hasta && <input type="hidden" name="hasta" value={hasta} />}
            <input name="q" defaultValue={sp.q ?? ""} className="search !min-h-[36px]" placeholder="Buscar causa, tarea o resultado…" aria-label="Buscar" />
          </form>
          <TasksFilters quien={quien} desde={desde} hasta={hasta} q={sp.q ?? ""} lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))} />
          <ExportButton
            filename="tareas-cerradas.csv"
            header={["Cerrada", "Causa", "Tipo", "Tarea", "Estado", "Resultado", "Vencía", "Plazo", "Quién", "En ráfaga"]}
            rows={rows.map((t) => [
              dateTime(closedAt(t), tz),
              t.legal_clients?.full_name ?? "",
              TASK_KINDS[t.kind] ?? t.kind,
              t.title,
              t.status,
              t.result ?? "",
              t.due_at ? dateTime(t.due_at, tz) : "",
              timing(t)?.text ?? "",
              nameOf(t.closed_by) ?? "",
              burst.has(t.id) ? "sí" : "",
            ])}
          />
          <Link href="/revision" className="btn-secondary">
            Por revisar
          </Link>
        </div>
      </div>

      {summary.length > 1 && !quien && (
        <section className="panel overflow-hidden">
          <div className="panel-head !py-3">
            <span className="card-title">Por persona</span>
            <span className="ml-auto text-[12px] text-muted">En el período elegido</span>
          </div>
          <div className="grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((s) => (
              <Link key={s.id} href={`/revision/tareas?quien=${s.id}${desde ? `&desde=${desde}` : ""}${hasta ? `&hasta=${hasta}` : ""}`} className="flex items-center gap-3 bg-surface px-4 py-3 hover:bg-surface-2">
                <span className="avatar solid h-8 w-8 text-[11px]">{initials(s.name) || "?"}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13.5px] font-semibold text-fg">{s.name}</span>
                  <span className="text-[12px] text-muted">
                    {s.total} {s.total === 1 ? "cierre" : "cierres"}
                    {s.late > 0 && <span className="text-danger"> · {s.late} tarde</span>}
                    {s.canceled > 0 && ` · ${s.canceled} canceladas`}
                    {s.burst > 0 && <span className="font-medium text-warning"> · {s.burst} en ráfaga</span>}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="check" />
            </span>
            <span className="empty-title">Sin tareas cerradas</span>
            <span className="empty-text">Cuando alguien complete o cancele una tarea aparecerá aquí con su resultado, quién la cerró y cuándo.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div role="table" aria-label="Tareas cerradas" className="min-w-[1080px]">
              <div className="grid grid-cols-[170px_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.8fr)_120px_190px] items-center gap-3 th-band border-y border-line px-4 py-2.5" role="row">
                {["Cerrada", "Causa", "Tarea", "Resultado", "Plazo", "Quién"].map((h) => (
                  <div key={h} className="th" role="columnheader">
                    {h}
                  </div>
                ))}
              </div>
              {rows.map((t) => {
                const tm = timing(t);
                const who = nameOf(t.closed_by);
                return (
                  <div key={t.id} className={`grid grid-cols-[170px_minmax(0,1.4fr)_minmax(0,1.6fr)_minmax(0,1.8fr)_120px_190px] items-center gap-3 row min-h-[50px] px-4 py-2 ${burst.has(t.id) ? "bg-[var(--warning-bg)]" : ""}`} role="row">
                    <div role="cell" className="flex flex-col">
                      <span className="tabnum text-[12.5px] text-soft">{dateTime(closedAt(t), tz)}</span>
                      {burst.has(t.id) && <span className="text-[11px] font-medium text-warning">En ráfaga</span>}
                    </div>
                    <div role="cell" className="flex min-w-0 flex-col">
                      <Link href={`/clientes/${t.client_id}?tab=Causa`} className="truncate text-[13px] font-medium text-fg hover:text-accent">
                        {t.legal_clients?.full_name ?? "Causa eliminada"}
                      </Link>
                      {t.legal_clients?.rol && <span className="truncate tabnum text-[11px] text-muted">{t.legal_clients.rol}</span>}
                    </div>
                    <div role="cell" className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] text-fg" title={t.title}>
                        {t.title}
                      </span>
                      <span className="text-[11px] text-muted">
                        {TASK_KINDS[t.kind] ?? t.kind}
                        {t.status === "cancelada" && <span className="text-danger"> · Cancelada</span>}
                      </span>
                    </div>
                    <div role="cell" className="min-w-0 text-[12.5px]">
                      {t.result ? (
                        <span className="line-clamp-2 text-soft" title={t.result}>
                          {t.result}
                        </span>
                      ) : (
                        <span className="text-faint">Sin resultado anotado</span>
                      )}
                    </div>
                    <div role="cell">{tm ? <span className={`tag ${tm.tone}`}>{tm.text}</span> : t.due_at ? null : <span className="text-[11.5px] text-faint">Sin vencimiento</span>}</div>
                    <div role="cell" className="flex min-w-0 items-center gap-2">
                      <span className="avatar solid h-6 w-6 shrink-0 text-[10px]" aria-hidden>
                        {initials(who ?? "") || "?"}
                      </span>
                      <span className="truncate text-[13px] font-semibold text-fg">{who ?? "Sin registro"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

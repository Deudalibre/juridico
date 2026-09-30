import Link from "next/link";
import { getMembers, requirePermission, type LegalClient, type LegalTask } from "@/lib/data";
import { dueLabel, relativeDays } from "@/lib/format";
import { COMPLETED, PROCEDURES, TASK_KINDS, stepsFor } from "@/lib/legal";
import { formatRut } from "@/lib/rut";
import { Icon } from "@/components/icons";
import { HelpPop } from "@/components/HelpPop";
import { BoardFilters } from "./BoardFilters";

// Tablero por paso: las causas activas de un procedimiento repartidas en columnas, una por paso (como el
// embudo del CRM). Solo lectura: cada tarjeta abre la ficha; los pasos se marcan desde la pestaña Causa.
export default async function TableroPage(props: { searchParams: Promise<{ proc?: string; ver?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, user, tz } = await requirePermission("legal.view");
  const members = await getMembers(supabase);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const proc = (PROCEDURES as readonly string[]).includes(sp.proc ?? "") ? sp.proc! : PROCEDURES[0];
  const wanted = sp.ver ?? "equipo";
  const view = wanted === "equipo" || wanted === "mios" || lawyers.some((m) => m.id === wanted) ? wanted : "equipo";

  let q = supabase.from("legal_clients").select("*").is("archived_at", null).eq("procedure_type", proc).order("updated_at", { ascending: false }).limit(1000);
  if (view === "mios") q = q.eq("lawyer_id", user.id);
  else if (view !== "equipo") q = q.eq("lawyer_id", view);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const clients = (data ?? []) as LegalClient[];
  const nextTask = new Map<string, LegalTask>();
  if (clients.length > 0) {
    const { data: t } = await supabase
      .from("legal_tasks")
      .select("*")
      .in("client_id", clients.map((c) => c.id))
      .eq("status", "pendiente")
      .order("due_at", { ascending: true, nullsFirst: false });
    for (const x of (t ?? []) as LegalTask[]) if (!nextTask.has(x.client_id)) nextTask.set(x.client_id, x);
  }

  const steps = [...stepsFor(proc), COMPLETED];
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? null : null);
  const columns = steps.map((step) => ({
    step,
    items: clients.filter((c) => (c.current_step ?? steps[0]) === step),
  }));
  const now = Date.now();

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="grid" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Tablero</h1>
            <span className="page-subtitle">
              {proc} · {clients.length} {clients.length === 1 ? "causa activa" : "causas activas"} repartidas por paso
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HelpPop label="Cómo se lee" title="Tablero por paso">
            <span>Cada columna es un paso del procedimiento y cada tarjeta una causa: dónde va, quién la lleva y qué tiene pendiente.</span>
            <span>Para avanzar una causa, ábrela y marca el paso en la pestaña «Causa». Aquí solo se mira.</span>
          </HelpPop>
          <BoardFilters proc={proc} view={view} lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))} />
        </div>
      </div>

      <div className="board stagger" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))` }}>
        {columns.map((col, i) => {
          const done = col.step === COMPLETED;
          const overdue = col.items.filter((c) => {
            const t = nextTask.get(c.id);
            return t?.due_at && Date.parse(t.due_at) < now;
          }).length;
          return (
            <div key={col.step} className="column" data-tone={done ? "won" : undefined}>
              <div className="column-head">
                <span className="column-icon">{done ? <Icon name="won" size={15} /> : <span className="text-[11px] font-bold">{i + 1}</span>}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="column-name">{col.step}</span>
                  <span className="column-sub">
                    {col.items.length} {col.items.length === 1 ? "causa" : "causas"}
                    {overdue > 0 && <span className="font-medium text-danger"> · {overdue} con tarea vencida</span>}
                  </span>
                </span>
              </div>
              <div className="column-body">
                {col.items.map((c) => {
                  const t = nextTask.get(c.id);
                  const due = t?.due_at ? dueLabel(t.due_at, tz) : null;
                  const lawyer = nameOf(c.lawyer_id);
                  const alert = due?.overdue ? "overdue" : !t && !done ? "needs-action" : done ? "won" : "";
                  return (
                    <Link key={c.id} href={`/clientes/${c.id}`} className={`deal-card ${alert}`} style={{ cursor: "pointer" }}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="card-name">{c.full_name}</span>
                        {c.next_review_at && Date.parse(c.next_review_at) <= now ? <span className="card-chip warning">Toca revisar</span> : c.last_review_at ? <span className="card-chip success">Revisada</span> : <span className="card-chip">Sin revisar</span>}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="card-meta">
                          <Icon name="user" size={13} />
                          <span className={`truncate ${lawyer ? "" : "font-medium text-warning"}`}>{lawyer ?? "Sin abogado"}</span>
                        </span>
                        <span className="card-meta">
                          <Icon name="tag" size={13} />
                          <span className="truncate tabnum">{[c.rut ? formatRut(c.rut) : null, c.rol].filter(Boolean).join(" · ") || "Sin RUT ni rol"}</span>
                        </span>
                        {!done && (
                          <span className="card-meta" title={t?.title ?? undefined}>
                            <Icon name="calendar" size={13} />
                            <span className={`truncate ${due?.overdue ? "text-danger" : due?.today ? "text-accent" : t ? "text-soft" : "text-warning"}`}>
                              {t ? `${TASK_KINDS[t.kind] ?? t.kind}: ${t.title}${due ? ` · ${due.text}` : ""}` : "Sin tarea pendiente"}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="card-foot">
                        <span className="text-[12px] text-muted">{c.intake_date ? `Ingresó ${relativeDays(`${c.intake_date}T12:00:00`, tz).toLowerCase()}` : "Sin fecha de ingreso"}</span>
                        <span className="text-[11.5px] text-faint">{c.last_review_at ? `Rev. ${relativeDays(c.last_review_at, tz).toLowerCase()}` : ""}</span>
                      </div>
                    </Link>
                  );
                })}
                {col.items.length === 0 && <span className="column-empty">Sin causas en este paso</span>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

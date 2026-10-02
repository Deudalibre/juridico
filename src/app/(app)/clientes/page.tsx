import Link from "next/link";
import { getMembers, requirePermission, type LegalClient, type LegalTask } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { COMPLETED, PROCEDURES, stepsFor } from "@/lib/legal";
import { formatRut } from "@/lib/rut";
import { Icon } from "@/components/icons";
import { ExportButton } from "@/components/ExportButton";
import { ClientsTable } from "./ClientsTable";
import { FilterMenu } from "./ListControls";

// Clientes en tramitación (tabla legal_clients; el vínculo con el lead comercial es lead_id).
// Misma estructura que «Todos los leads» en el CRM: cabecera con icono, buscador y alta; tabla con acciones al final.
type SP = { q?: string; estado?: string; proc?: string; abogado?: string; paso?: string; desde?: string; hasta?: string };
const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function ClientesPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const { supabase, can, tz } = await requirePermission("legal.view");
  const closed = sp.estado === "cerradas";
  let q = supabase.from("legal_clients").select("*").order(closed ? "archived_at" : "updated_at", { ascending: false }).limit(500);
  q = closed ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  // Filtros (como en la lista de leads): solo valores conocidos llegan a la consulta
  const proc = (PROCEDURES as readonly string[]).includes(sp.proc ?? "") ? sp.proc! : "";
  if (proc) q = q.eq("procedure_type", proc);
  if (isDate(sp.desde)) q = q.gte("intake_date", sp.desde!);
  if (isDate(sp.hasta)) q = q.lte("intake_date", sp.hasta!);
  // Todo lo que no depende entre sí va en un solo viaje: abogados, causas, totales y tareas pendientes
  // (las tareas se piden completas y se cruzan aquí: son pocas y así no esperan a la lista de causas)
  const [members, res, counts, pendingTasks] = await Promise.all([
    getMembers(supabase),
    q,
    supabase.from("legal_clients").select("id, archived_at"),
    closed ? Promise.resolve({ data: [] as LegalTask[] }) : supabase.from("legal_tasks").select("*").eq("status", "pendiente").order("due_at", { ascending: true, nullsFirst: false }),
  ]);
  if (res.error) throw new Error(res.error.message);
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const abogado = sp.abogado === "sin" || lawyers.some((m) => m.id === sp.abogado) ? sp.abogado! : "";
  const paso = sp.paso && [...PROCEDURES.flatMap((p) => [...stepsFor(p)]), COMPLETED].includes(sp.paso) ? sp.paso : "";
  const term = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const digits = term.replace(/\./g, "");
  const all = (res.data ?? []) as LegalClient[];
  const rows = all.filter(
    (c) =>
      (!term || c.full_name.toLowerCase().includes(term) || (c.rut ?? "").replace(/\./g, "").includes(digits) || (c.rol ?? "").toLowerCase().includes(term)) &&
      (!abogado || (abogado === "sin" ? !c.lawyer_id : c.lawyer_id === abogado)) &&
      (!paso || (c.current_step ?? stepsFor(c.procedure_type)[0]) === paso)
  );
  const totals = { activas: (counts.data ?? []).filter((c) => !c.archived_at).length, cerradas: (counts.data ?? []).filter((c) => c.archived_at).length };
  const filters = { proc, abogado, paso, desde: isDate(sp.desde) ? sp.desde : "", hasta: isDate(sp.hasta) ? sp.hasta : "" };
  const filterCount = Object.values(filters).filter(Boolean).length;
  const keepParams: Record<string, string> = {};
  if (closed) keepParams.estado = "cerradas";
  if (sp.q) keepParams.q = sp.q;
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.full_name ?? "" : "");
  const exportRows = rows.map((c) => [
    c.full_name,
    c.rut ? formatRut(c.rut) : "",
    c.procedure_type ?? "",
    c.rol ?? "",
    c.tribunal ?? "",
    closed ? c.close_reason ?? "" : c.current_step ?? stepsFor(c.procedure_type)[0] ?? "",
    nameOf(c.lawyer_id),
    c.intake_date ?? "",
    c.last_review_at ? dateTime(c.last_review_at, tz) : "",
    c.phone ?? "",
    c.email ?? "",
  ]);

  // Próxima acción de cada causa: la tarea pendiente que vence antes
  const nextTasks: Record<string, LegalTask> = {};
  if (!closed) {
    const shown = new Set(rows.map((c) => c.id));
    for (const t of (pendingTasks.data ?? []) as LegalTask[]) if (shown.has(t.client_id) && !nextTasks[t.client_id]) nextTasks[t.client_id] = t;
  }
  const keep = sp.q ? `&q=${encodeURIComponent(sp.q)}` : "";

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="user" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">{closed ? "Causas cerradas" : "Clientes"}</h1>
            <span className="page-subtitle">
              {closed ? `${totals.cerradas} cerradas` : `${totals.activas} en tramitación`}
              {term ? ` · ${rows.length} coinciden con «${sp.q?.trim()}»` : " · busca por nombre, RUT o rol"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="seg" aria-label="Estado de las causas">
            <Link href={`/clientes?${keep.slice(1)}`} aria-current={!closed ? "true" : undefined}>
              Activas
            </Link>
            <Link href={`/clientes?estado=cerradas${keep}`} aria-current={closed ? "true" : undefined}>
              Cerradas
            </Link>
          </nav>
          <form action="/clientes" className="contents" role="search">
            {closed && <input type="hidden" name="estado" value="cerradas" />}
            {Object.entries(filters).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
            <input name="q" defaultValue={sp.q ?? ""} className="search !min-h-[36px]" placeholder="Buscar nombre, RUT o rol…" aria-label="Buscar clientes" />
          </form>
          <FilterMenu values={filters} count={filterCount} closed={closed} keep={keepParams} clearHref={closed ? "/clientes?estado=cerradas" : "/clientes"} lawyers={lawyers.map((m) => ({ id: m.id, name: m.full_name || m.email }))} />
          <ExportButton
            filename={`causas-${closed ? "cerradas" : "activas"}.csv`}
            header={["Cliente", "RUT", "Procedimiento", "Rol", "Tribunal", closed ? "Motivo de cierre" : "Paso", "Abogado", "Ingreso", "Última revisión", "Teléfono", "Email"]}
            rows={exportRows}
          />
          {can("legal.create") && !closed && (
            <Link href="/clientes/nuevo" className="btn-primary">
              + Nuevo cliente
            </Link>
          )}
        </div>
      </div>

      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="user" />
            </span>
            <span className="empty-title">{term ? "No hay resultados para esta búsqueda" : closed ? "Todavía no hay causas cerradas" : "Aún no hay clientes en tramitación"}</span>
            <span className="empty-text">
              {closed
                ? "Las causas cerradas desde la ficha, con su motivo, se conservan aquí con todo su historial."
                : "Un cliente se crea aquí o desde el CRM cuando un lead pasa a «Contratado»: llegan nombre, RUT, teléfono y email."}
            </span>
          </div>
        ) : (
          <div className="scroll-x">
            <ClientsTable rows={rows} members={members} nextTasks={nextTasks} canAssign={can("legal.assign")} closed={closed} tz={tz} />
          </div>
        )}
      </section>
    </>
  );
}

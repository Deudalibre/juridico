import Link from "next/link";
import { getMembers, requirePermission, type LegalClient, type LegalTask } from "@/lib/data";
import { Icon } from "@/components/icons";
import { ClientsTable } from "./ClientsTable";

// Clientes en tramitación (tabla legal_clients; el vínculo con el lead comercial es lead_id).
// Misma estructura que «Todos los leads» en el CRM: cabecera con icono, buscador y alta; tabla con acciones al final.
export default async function ClientesPage(props: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, can, tz } = await requirePermission("legal.view");
  const closed = sp.estado === "cerradas";
  let q = supabase.from("legal_clients").select("*").order(closed ? "archived_at" : "updated_at", { ascending: false }).limit(500);
  q = closed ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  const [members, res, counts] = await Promise.all([
    getMembers(supabase),
    q,
    supabase.from("legal_clients").select("id, archived_at"),
  ]);
  if (res.error) throw new Error(res.error.message);
  const term = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const digits = term.replace(/\./g, "");
  const all = (res.data ?? []) as LegalClient[];
  const rows = all.filter(
    (c) => !term || c.full_name.toLowerCase().includes(term) || (c.rut ?? "").replace(/\./g, "").includes(digits) || (c.rol ?? "").toLowerCase().includes(term)
  );
  const totals = { activas: (counts.data ?? []).filter((c) => !c.archived_at).length, cerradas: (counts.data ?? []).filter((c) => c.archived_at).length };

  // Próxima acción de cada causa: la tarea pendiente que vence antes
  const nextTasks: Record<string, LegalTask> = {};
  if (!closed && rows.length > 0) {
    const { data } = await supabase
      .from("legal_tasks")
      .select("*")
      .in("client_id", rows.map((c) => c.id))
      .eq("status", "pendiente")
      .order("due_at", { ascending: true, nullsFirst: false });
    for (const t of (data ?? []) as LegalTask[]) if (!nextTasks[t.client_id]) nextTasks[t.client_id] = t;
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
            <input name="q" defaultValue={sp.q ?? ""} className="search !min-h-[36px]" placeholder="Buscar nombre, RUT o rol…" aria-label="Buscar clientes" />
          </form>
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

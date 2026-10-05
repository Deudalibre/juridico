import Link from "next/link";
import { Suspense } from "react";
import Loading from "../loading";
import { getMembers, requirePermission, type LegalClient, type LegalTask } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { COMPLETED, IN_PREPARATION, PROCEDURES, SEMAFORO, isSemaforo, stepLabel, stepsFor } from "@/lib/legal";
import { formatRut } from "@/lib/rut";
import { Icon } from "@/components/icons";
import { ExportButton } from "@/components/ExportButton";
import { ClientsTable } from "./ClientsTable";
import { FilterMenu } from "./ListControls";

// Clientes en tramitación (tabla legal_clients; el vínculo con el lead comercial es lead_id).
// Misma estructura que «Todos los leads» en el CRM: cabecera con icono, buscador y alta; tabla con acciones al final.
type SP = { q?: string; estado?: string; proc?: string; abogado?: string; paso?: string; color?: string; desde?: string; hasta?: string; pagina?: string };
// Filas por página: con toda la cartera de una vez la respuesta pesaba 1,3 MB (244 filas con su selector de abogado)
const PAGE = 50;
const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Causas" };

/**
 * La carga de datos vive en el hijo de abajo, dentro de un <Suspense> con el mismo esqueleto de loading.tsx.
 * Así la navegación a esta pantalla es instantánea (Next 16 lo valida en desarrollo): el marco y el esqueleto
 * aparecen al clic y los datos entran en streaming. loading.tsx solo cubre la carga directa, no la navegación.
 */
export default function ClientesPage(props: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<Loading />}>
      <ClientesContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ClientesContent(props: { searchParams: Promise<SP> }) {
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
  const paso = sp.paso && [IN_PREPARATION, ...PROCEDURES.flatMap((p) => [...stepsFor(p)]), COMPLETED].includes(sp.paso) ? sp.paso : "";
  // «sin» = causas sin color marcado
  const color = sp.color === "sin" || isSemaforo(sp.color) ? sp.color! : "";
  const term = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const digits = term.replace(/\./g, "");
  const all = (res.data ?? []) as LegalClient[];
  const rows = all.filter(
    (c) =>
      (!term || c.full_name.toLowerCase().includes(term) || (c.rut ?? "").replace(/\./g, "").includes(digits) || (c.rol ?? "").toLowerCase().includes(term)) &&
      (!abogado || (abogado === "sin" ? !c.lawyer_id : c.lawyer_id === abogado)) &&
      (!paso || stepLabel(c) === paso) &&
      (!color || (color === "sin" ? !c.semaforo : c.semaforo === color))
  );
  const totals = { activas: (counts.data ?? []).filter((c) => !c.archived_at).length, cerradas: (counts.data ?? []).filter((c) => c.archived_at).length };
  const filters = { proc, abogado, paso, color, desde: isDate(sp.desde) ? sp.desde : "", hasta: isDate(sp.hasta) ? sp.hasta : "" };
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
    closed ? c.close_reason ?? "" : stepLabel(c) ?? "",
    closed ? "" : c.semaforo ? SEMAFORO[c.semaforo]?.label ?? c.semaforo : "",
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
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.pagina) || 1));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const pageHref = (n: number) => {
    const u = new URLSearchParams();
    if (closed) u.set("estado", "cerradas");
    if (sp.q) u.set("q", sp.q);
    for (const [k, v] of Object.entries(filters)) if (v) u.set(k, v);
    if (n > 1) u.set("pagina", String(n));
    const qs = u.toString();
    return qs ? `/clientes?${qs}` : "/clientes";
  };

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
            header={["Cliente", "RUT", "Procedimiento", "Rol", "Tribunal", closed ? "Motivo de cierre" : "Paso", "Color", "Abogado", "Ingreso", "Última revisión", "Teléfono", "Email"]}
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
            <ClientsTable rows={shown} members={members} nextTasks={nextTasks} canAssign={can("legal.assign")} canEdit={can("legal.edit")} closed={closed} tz={tz} />
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12.5px] text-muted">
            <span>
              Página {page} de {pages} · {rows.length} causas · {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, rows.length)}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="btn-outline">
                  ← Anterior
                </Link>
              )}
              {page < pages && (
                <Link href={pageHref(page + 1)} className="btn-outline">
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

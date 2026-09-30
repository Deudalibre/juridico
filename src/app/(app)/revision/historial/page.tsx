import Link from "next/link";
import { requirePermission, type LegalReview } from "@/lib/data";
import { dateTime, initials } from "@/lib/format";
import { Icon } from "@/components/icons";
import { ExportButton } from "@/components/ExportButton";

// Historial de revisiones del estudio: qué causa, cuándo, quién, si hubo movimiento y qué quedó pendiente.
export default async function HistorialRevisionesPage(props: { searchParams: Promise<{ q?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, tz } = await requirePermission("legal.view");
  const { data, error } = await supabase.from("legal_reviews").select("*, legal_clients(full_name, rol, procedure_type), legal_tasks(title)").order("reviewed_at", { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  type Row = LegalReview & { legal_clients: { full_name: string; rol: string | null; procedure_type: string | null } | null; legal_tasks: { title: string } | null };
  const term = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => !term || (r.legal_clients?.full_name ?? "").toLowerCase().includes(term) || (r.reviewer_name ?? "").toLowerCase().includes(term));

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="history" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Historial de revisiones</h1>
            <span className="page-subtitle">Las últimas {rows.length} revisiones{term ? ` que coinciden con «${sp.q?.trim()}»` : " del estudio"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/revision/historial" className="contents" role="search">
            <input name="q" defaultValue={sp.q ?? ""} className="search !min-h-[36px]" placeholder="Buscar causa o revisor…" aria-label="Buscar en el historial" />
          </form>
          <ExportButton
            filename="revisiones.csv"
            header={["Cuándo", "Causa", "Procedimiento", "Rol", "Movimiento", "Nota", "Tarea", "Revisó"]}
            rows={rows.map((r) => [dateTime(r.reviewed_at, tz), r.legal_clients?.full_name ?? "", r.legal_clients?.procedure_type ?? "", r.legal_clients?.rol ?? "", r.had_movement ? "Con movimiento" : "Sin movimiento", r.note ?? "", r.legal_tasks?.title ?? "", r.reviewer_name ?? ""])}
          />
          <Link href="/revision" className="btn-secondary">
            Por revisar
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="history" />
            </span>
            <span className="empty-title">Aún no hay revisiones</span>
            <span className="empty-text">Cada vez que revises una causa quedará aquí: fecha, quién revisó, si hubo movimiento y la tarea que dejó.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div role="table" aria-label="Revisiones" className="min-w-[980px]">
              <div className="grid grid-cols-[170px_minmax(0,1.6fr)_140px_minmax(0,2fr)_190px] items-center gap-3 th-band border-y border-line px-4 py-2.5" role="row">
                {["Cuándo", "Causa", "Movimiento", "Nota y tarea", "Revisó"].map((h) => (
                  <div key={h} className="th" role="columnheader">
                    {h}
                  </div>
                ))}
              </div>
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[170px_minmax(0,1.6fr)_140px_minmax(0,2fr)_190px] items-center gap-3 row min-h-[50px] px-4 py-2" role="row">
                  <div role="cell" className="tabnum text-[12.5px] text-soft">
                    {dateTime(r.reviewed_at, tz)}
                  </div>
                  <div role="cell" className="flex min-w-0 flex-col">
                    <Link href={`/clientes/${r.client_id}`} className="truncate text-[13px] font-medium text-fg hover:text-accent">
                      {r.legal_clients?.full_name ?? "Causa eliminada"}
                    </Link>
                    <span className="truncate text-[11px] text-muted">{[r.legal_clients?.procedure_type, r.legal_clients?.rol].filter(Boolean).join(" · ")}</span>
                  </div>
                  <div role="cell">
                    <span className={`tag ${r.had_movement ? "brand" : ""}`}>{r.had_movement ? "Con movimiento" : "Sin movimiento"}</span>
                  </div>
                  <div role="cell" className="flex min-w-0 flex-col text-[12.5px]">
                    {r.note ? <span className="truncate text-soft" title={r.note}>{r.note}</span> : <span className="text-faint">Sin nota</span>}
                    {r.legal_tasks?.title && <span className="truncate text-[11.5px] text-muted">Tarea: {r.legal_tasks.title}</span>}
                  </div>
                  <div role="cell" className="flex min-w-0 items-center gap-2">
                    <span className="avatar solid h-6 w-6 shrink-0 text-[10px]" aria-hidden>
                      {initials(r.reviewer_name ?? "") || "?"}
                    </span>
                    <span className="truncate text-[13px] font-semibold text-fg">{r.reviewer_name ?? "Sin nombre"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

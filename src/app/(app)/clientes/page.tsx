import Link from "next/link";
import { getMembers, getStatuses, requirePermission, type LegalClient } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { Icon } from "@/components/icons";

// Clientes en tramitación: la tabla legal_clients (misma base que el CRM; el vínculo con el
// lead comercial es legal_clients.lead_id).
export default async function ClientesPage({ searchParams: sp }: { searchParams: { q?: string } }) {
  const { supabase, tz, can } = await requirePermission("legal.view");
  const [statuses, members, res] = await Promise.all([
    getStatuses(supabase),
    getMembers(supabase),
    supabase.from("legal_clients").select("*").is("archived_at", null).order("updated_at", { ascending: false }).limit(500),
  ]);
  if (res.error) throw new Error(res.error.message);
  const term = sp.q?.trim().toLowerCase() ?? "";
  const rows = ((res.data ?? []) as LegalClient[]).filter(
    (c) => !term || c.full_name.toLowerCase().includes(term) || (c.rut ?? "").replace(/\./g, "").includes(term.replace(/\./g, ""))
  );
  const statusName = (id: string | null) => statuses.find((s) => s.id === id)?.name ?? "Sin estado";
  const lawyerName = (id: string | null) => members.find((m) => m.id === id)?.full_name ?? "—";

  return (
    <>
      <div className="page-head !min-h-0 !py-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="page-title">Clientes</h1>
          <span className="text-[12.5px] text-muted">{rows.length} en tramitación</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/clientes" className="contents" role="search">
            <input name="q" defaultValue={sp.q ?? ""} className="search !min-h-[36px]" placeholder="Buscar por nombre o RUT…" aria-label="Buscar clientes" />
          </form>
          {can("legal.create") && (
            <Link href="/clientes/nuevo" className="btn-primary">
              + Nuevo cliente
            </Link>
          )}
        </div>
      </div>

      <section className="panel !rounded-xl overflow-hidden">
        {rows.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="user" />
            </span>
            <span className="empty-title">{term ? "No hay resultados para esta búsqueda" : "Aún no hay clientes en tramitación"}</span>
            <span className="empty-text">
              Un cliente puede crearse aquí o desde el CRM cuando un lead pasa a «Contratado» (comparten nombre, RUT y contacto).
            </span>
          </div>
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  {["Cliente", "RUT", "Procedimiento", "Estado", "Abogado", "Última revisión"].map((h) => (
                    <th key={h} className="th border-b border-line-soft px-4 py-1.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="h-[46px] border-b border-line-soft">
                    <td className="px-4">
                      <Link href={`/clientes/${c.id}`} className="font-medium">
                        {c.full_name}
                      </Link>
                      {c.lead_id && <span className="ml-2 text-[11.5px] text-faint">desde el CRM</span>}
                    </td>
                    <td className="tabnum px-4 text-soft">{c.rut ?? <span className="text-warning">Pendiente</span>}</td>
                    <td className="px-4 text-soft">{c.procedure_type ?? <span className="text-faint">—</span>}</td>
                    <td className="px-4">
                      <span className="badge neutral">{statusName(c.status_id)}</span>
                    </td>
                    <td className="px-4 text-soft">{lawyerName(c.lawyer_id)}</td>
                    <td className="tabnum px-4 text-muted">{c.last_review_at ? shortDate(c.last_review_at, tz) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

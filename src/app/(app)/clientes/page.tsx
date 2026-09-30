import Link from "next/link";
import { getMembers, getStatuses, requirePermission, type LegalClient } from "@/lib/data";
import { Icon } from "@/components/icons";
import { ClientsTable } from "./ClientsTable";

// Clientes en tramitación (tabla legal_clients; el vínculo con el lead comercial es lead_id).
// Misma estructura que «Todos los leads» en el CRM: cabecera con icono, buscador y alta; tabla con acciones al final.
export default async function ClientesPage(props: { searchParams: Promise<{ q?: string }> }) {
  const sp = await props.searchParams;
  const { supabase, can } = await requirePermission("legal.view");
  const [statuses, members, res] = await Promise.all([
    getStatuses(supabase),
    getMembers(supabase),
    supabase.from("legal_clients").select("*").is("archived_at", null).order("updated_at", { ascending: false }).limit(500),
  ]);
  if (res.error) throw new Error(res.error.message);
  const term = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const digits = term.replace(/\./g, "");
  const all = (res.data ?? []) as LegalClient[];
  const rows = all.filter(
    (c) => !term || c.full_name.toLowerCase().includes(term) || (c.rut ?? "").replace(/\./g, "").includes(digits) || (c.rol ?? "").toLowerCase().includes(term)
  );
  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="user" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Clientes</h1>
            <span className="page-subtitle">
              {all.length} en tramitación{term ? ` · ${rows.length} coinciden con «${sp.q?.trim()}»` : " · busca por nombre, RUT o rol"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/clientes" className="contents" role="search">
            <input name="q" defaultValue={sp.q ?? ""} className="search !min-h-[36px]" placeholder="Buscar nombre, RUT o rol…" aria-label="Buscar clientes" />
          </form>
          {can("legal.create") && (
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
            <span className="empty-title">{term ? "No hay resultados para esta búsqueda" : "Aún no hay clientes en tramitación"}</span>
            <span className="empty-text">Un cliente se crea aquí o desde el CRM cuando un lead pasa a «Contratado»: llegan nombre, RUT, teléfono y email.</span>
          </div>
        ) : (
          <div className="scroll-x">
            <ClientsTable rows={rows} members={members} statuses={statuses.map((s) => ({ id: s.id, name: s.name }))} canAssign={can("legal.assign")} />
          </div>
        )}
      </section>
    </>
  );
}

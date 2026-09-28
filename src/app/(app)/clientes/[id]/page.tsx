import Link from "next/link";
import { notFound } from "next/navigation";
import { getMembers, getStatuses, requirePermission, type LegalClient } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { BasicsForm } from "./BasicsForm";

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

// Ficha única del cliente. Hoy: antecedentes básicos (los que ya existen en legal_clients).
// Las demás pestañas se construyen cuando exista el mapa de plantillas: se indican como pendientes.
const TABS = ["Antecedentes", "Insolvencia", "Acreedores", "Bienes", "Ingresos y gastos", "Documentos"] as const;

export default async function ClientePage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { supabase, tz, can } = await requirePermission("legal.view");
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [{ data }, statuses, members] = await Promise.all([
    supabase.from("legal_clients").select("*").eq("id", params.id).maybeSingle(),
    getStatuses(supabase),
    getMembers(supabase),
  ]);
  if (!data) notFound();
  const c = data as LegalClient & { caratula: string | null; next_action: string | null; last_action: string | null };
  const tab = TABS.find((t) => t === searchParams.tab) ?? TABS[0];
  const status = statuses.find((s) => s.id === c.status_id)?.name ?? "Sin estado";
  const lawyer = members.find((m) => m.id === c.lawyer_id)?.full_name;

  // Qué falta para poder generar documentos (solo lo que ya existe en la ficha)
  const missing = [!c.rut && "RUT", !c.phone && !c.email && "contacto", !c.procedure_type && "procedimiento"].filter(Boolean) as string[];

  return (
    <>
      <div className="panel gap-3 px-5 py-4">
        <Link href="/clientes" className="link-muted self-start text-xs">
          ← Volver a clientes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="page-title">{c.full_name}</h1>
              <span className="badge neutral">{status}</span>
            </div>
            <span className="text-[13px] text-soft">
              {c.rut ? <span className="tabnum">RUT {formatRut(c.rut)}</span> : <span className="text-warning">RUT pendiente</span>}
              {c.procedure_type && ` · ${c.procedure_type}`}
              {lawyer && ` · ${lawyer}`}
              {c.last_review_at && ` · última revisión ${dateTime(c.last_review_at, tz)}`}
            </span>
            {missing.length > 0 && <span className="text-[12.5px] text-warning">Falta: {missing.join(", ")}</span>}
          </div>
          {c.lead_id && (
            <a href={`${CRM_URL}/leads/${c.lead_id}`} className="btn-ghost btn-sm">
              Ver lead en el CRM
            </a>
          )}
        </div>
        <nav className="seg self-start" aria-label="Secciones de la ficha">
          {TABS.map((t) => (
            <Link key={t} href={`/clientes/${c.id}?tab=${encodeURIComponent(t)}`} aria-current={tab === t ? "true" : undefined}>
              {t}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "Antecedentes" ? (
        <BasicsForm client={c} canEdit={can("legal.edit")} />
      ) : (
        <section className="panel empty">
          <span className="empty-title">{tab}: pendiente del mapa de plantillas</span>
          <span className="empty-text">
            Los campos de esta pestaña se definen a partir de los formularios y plantillas reales del estudio, para no pedir información que no se use en
            los documentos.
          </span>
        </section>
      )}
    </>
  );
}

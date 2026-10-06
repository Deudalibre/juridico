import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { Icon } from "@/components/icons";
import { requirePermission } from "@/lib/data";
import { formatRut } from "@/lib/rut";
import { NuevaLvs } from "./NuevaLvs";

export const metadata = { title: "Nueva solicitud LVS" };

type SP = { q?: string };

export default function NuevaLvsPage(props: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<Loading />}>
      <NuevaLvsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

/**
 * Dos caminos, los dos de un clic: abrir el expediente a un cliente que ya está en Jurídico (se busca por
 * nombre o RUT) o dar de alta uno nuevo con lo mínimo. El resto se completa en la Ficha Maestra.
 */
async function NuevaLvsContent(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  await requirePermission("documents.view");
  const { supabase } = await requirePermission("legal.create");
  const q = (sp.q ?? "").trim();
  const [{ data: clients }, { data: existing }] = await Promise.all([
    q
      ? supabase
          .from("legal_clients")
          .select("id, internal_number, full_name, rut, procedure_type")
          .is("archived_at", null)
          // Por nombre siempre; por RUT solo si lo escrito tiene dígitos (si no, «rut.ilike.%%» devolvería a todos)
          .or([`full_name.ilike.%${q.replace(/[%,()]/g, "")}%`, ...(q.replace(/[^0-9kK]/g, "").length >= 3 ? [`rut.ilike.%${q.replace(/[^0-9kK]/g, "")}%`] : [])].join(","))
          .order("full_name")
          .limit(20)
      : supabase.from("legal_clients").select("id, internal_number, full_name, rut, procedure_type").is("archived_at", null).order("updated_at", { ascending: false }).limit(8),
    supabase.from("legal_lvs").select("client_id"),
  ]);
  const withLvs = new Set((existing ?? []).map((e) => e.client_id as string));
  const candidates = ((clients ?? []) as { id: string; internal_number: string | null; full_name: string; rut: string | null; procedure_type: string | null }[]).map((c) => ({
    ...c,
    rutLabel: c.rut ? formatRut(c.rut) : null,
    hasLvs: withLvs.has(c.id),
  }));

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="plus" size={18} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="page-title">Nueva solicitud LVS</h1>
            <span className="page-subtitle">Elige un cliente que ya está en Jurídico o dalo de alta. El expediente se abre al instante.</span>
          </div>
        </div>
      </div>
      <NuevaLvs q={q} candidates={candidates} />
    </>
  );
}

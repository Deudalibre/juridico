import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { Icon } from "@/components/icons";
import { requirePermission, type LegalClient } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { LVS_ESTADOS, lvsEstadoTone, lvsProgress, type LvsFicha } from "@/lib/lvs";
import { DeleteLvsButton } from "./DeleteLvsButton";

export const metadata = { title: "Solicitudes LVS" };

type SP = { q?: string };

export default function LvsPage(props: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<Loading />}>
      <LvsContent searchParams={props.searchParams} />
    </Suspense>
  );
}

const GRID = "grid min-w-[760px] grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_112px] items-center gap-x-4";

/** Todas las solicitudes de Liquidación Voluntaria Simplificada: cliente, avance de la ficha, estado y última edición. */
async function LvsContent(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  // Las solicitudes LVS son del administrador: el abogado tramitador (sin documents.view) no las ve
  const { supabase, can, tz } = await requirePermission("documents.view");
  const q = (sp.q ?? "").trim().toLowerCase();
  const { data } = await supabase
    .from("legal_lvs")
    .select("*, legal_clients!inner(id, internal_number, full_name, rut, archived_at, updated_at, legal_lvs_generados(count))")
    .order("updated_at", { ascending: false })
    .limit(500);
  type Row = LvsFicha & { legal_clients: Pick<LegalClient, "id" | "internal_number" | "full_name" | "rut" | "archived_at" | "updated_at"> & { legal_lvs_generados: { count: number }[] } };
  const rows = ((data ?? []) as Row[]).filter((r) => {
    if (!q) return true;
    const c = r.legal_clients;
    return c.full_name.toLowerCase().includes(q) || (c.rut ?? "").includes(q.replace(/[^0-9k]/gi, "")) || (c.internal_number ?? "").includes(q);
  });

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="report" size={18} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="page-title">Solicitudes LVS</h1>
            <span className="page-subtitle">
              {rows.length === 1 ? "1 expediente" : `${rows.length} expedientes`} de Liquidación Voluntaria Simplificada · la Ficha Maestra alimenta demanda, Declaración 273-A y anexos
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative" role="search">
            <input name="q" defaultValue={sp.q ?? ""} className="search" placeholder="Buscar nombre, RUT o N°…" aria-label="Buscar expediente" autoComplete="off" />
          </form>
          {can("legal.create") && (
            <Link href="/documentos/lvs/nueva" className="btn-primary">
              + Nueva solicitud
            </Link>
          )}
        </div>
      </div>

      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="report" />
            </span>
            <span className="empty-title">{q ? "Sin resultados" : "Todavía no hay solicitudes LVS"}</span>
            <span className="empty-text">{q ? "Prueba con otro nombre o RUT." : "Crea la primera con «Nueva solicitud»: eliges un cliente existente o lo das de alta ahí mismo."}</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className={`${GRID} th-band border-b border-line px-4 py-2`} role="row">
              {["Cliente", "Ficha maestra", "Estado", "Última edición", ""].map((h, i) => (
                <span key={i} className="th" role="columnheader">
                  {h}
                </span>
              ))}
            </div>
            {rows.map((r) => {
              const c = r.legal_clients;
              const p = lvsProgress(r, c);
              return (
                <Link key={r.client_id} href={`/documentos/lvs/${r.client_id}`} className={`${GRID} row min-h-[52px] px-4 py-2 text-fg`} role="row">
                  <span className="flex min-w-0 flex-col" role="cell">
                    <span className="truncate text-[13px] font-semibold">
                      {c.internal_number ? <span className="tabnum text-muted">{c.internal_number} · </span> : null}
                      {c.full_name}
                    </span>
                    <span className="tabnum text-[11.5px] text-muted">{c.rut ? formatRut(c.rut) : "RUT pendiente"}</span>
                  </span>
                  <span className="flex items-center gap-2" role="cell" title={p.missing.length ? `Falta: ${p.missing.join(", ")}` : "Completa"}>
                    <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                      <span className="block h-full rounded-full bar-grow" style={{ width: `${p.pct}%`, background: p.pct === 100 ? "var(--success)" : "var(--brand-dark)" }} />
                    </span>
                    <span className="tabnum text-[12px] text-soft">{p.pct}%</span>
                  </span>
                  <span role="cell">
                    <span className={`tag ${lvsEstadoTone(r.estado)}`}>{LVS_ESTADOS[r.estado]}</span>
                  </span>
                  <span className="tabnum text-[12px] text-muted" role="cell">
                    {dateTime(r.updated_at, tz)}
                  </span>
                  <span className="flex items-center justify-end gap-1" role="cell">
                    <span className="btn-secondary btn-sm">Abrir</span>
                    {/* Eliminar la solicitud (solo la solicitud: la causa sigue en Clientes). El botón vive dentro del enlace de la
                        fila; el diálogo se abre en un portal y corta los eventos para no navegar. */}
                    {can("documents.manage") && <DeleteLvsButton clientId={r.client_id} name={c.full_name} generados={c.legal_lvs_generados?.[0]?.count ?? 0} />}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

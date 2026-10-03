import Link from "next/link";
import { notFound } from "next/navigation";
import { ViewTransition } from "react";
import { Icon } from "@/components/icons";
import { getContext, type LegalClient } from "@/lib/data";
import { dateTime, initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { LVS_ESTADOS, LVS_TABS, PREGUNTAS_273A, lvsEstadoTone, lvsProgress, type LvsFicha, type LvsTab } from "@/lib/lvs";
import { FichaForm } from "./FichaForm";
import { AbrirExpediente } from "./AbrirExpediente";

export const metadata = { title: "Expediente LVS" };

type History = { id: number; at: string; actor_name: string | null; kind: string; summary: string | null };

/** Etapas que aún no están construidas: la pestaña existe para que el flujo ya se vea completo. */
const PROXIMAS: Partial<Record<LvsTab, { etapa: number; texto: string }>> = {
  Bienes: { etapa: 3, texto: "Listas de bienes raíces, vehículos, aguas, sociedades, instrumentos y bienes muebles (Anexo 8), según lo respondido en la ficha." },
  Acreedores: { etapa: 5, texto: "Deudas del cliente tomadas del catálogo maestro de acreedores; alimentan el Anexo 9 y su total." },
  Juicios: { etapa: 6, texto: "Causas pendientes del cliente para el numeral 4 del artículo 273 A." },
  Documentación: { etapa: 2, texto: "Documentos requeridos, generados solos a partir de la ficha (cédula, CMF, CAV de cada vehículo…), con su estado." },
  Generados: { etapa: 8, texto: "Anexo 8, Anexo 9, Declaración 273-A y demanda generados desde las plantillas Word, con versión y descarga." },
};

export default async function ExpedientePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, can, tz } = await getContext();
  if (!can("legal.view")) notFound();
  const [{ data: client }, { data: lvs }] = await Promise.all([
    supabase.from("legal_clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("legal_lvs").select("*").eq("client_id", id).maybeSingle(),
  ]);
  if (!client) notFound();
  const c = client as LegalClient;
  const f = (lvs as LvsFicha | null) ?? null;
  const canEdit = can("legal.edit") && !c.archived_at;
  const tab: LvsTab = (LVS_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as LvsTab) : f ? "Resumen" : "Ficha maestra";
  const p = lvsProgress(f, c);

  const history =
    f && tab === "Historial"
      ? (((await supabase.from("legal_case_history").select("id, at, actor_name, kind, summary").eq("client_id", id).eq("kind", "lvs").order("at", { ascending: false }).limit(200)).data ?? []) as History[])
      : [];

  return (
    <>
      <div className="page-head !flex-col !items-stretch gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="avatar solid h-10 w-10 text-[13px]">{initials(c.full_name) || "?"}</span>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="page-title">{c.full_name}</h1>
                {f && <span className={`tag ${lvsEstadoTone(f.estado)}`}>{LVS_ESTADOS[f.estado]}</span>}
                {c.archived_at && <span className="tag danger">Causa cerrada</span>}
              </div>
              <span className="text-[13px] text-soft">
                {c.rut ? <span className="tabnum">RUT {formatRut(c.rut)}</span> : <span className="text-warning">RUT pendiente</span>}
                {c.internal_number && <span className="tabnum"> · N° {c.internal_number}</span>}
                {" · Liquidación voluntaria simplificada"}
                {f && ` · ficha ${p.pct}%`}
              </span>
              {f && p.missing.length > 0 && (
                <span className="text-[12.5px] text-warning">
                  Falta: {p.missing.slice(0, 6).join(", ")}
                  {p.missing.length > 6 ? ` y ${p.missing.length - 6} más` : ""}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/clientes/${c.id}`} className="btn-outline btn-sm">
              <Icon name="user" size={13} /> Ficha de la causa
            </Link>
            <Link href="/documentos/lvs" className="btn-ghost btn-sm">
              Todas las solicitudes
            </Link>
          </div>
        </div>
        {f && (
          <nav className="seg self-start" aria-label="Secciones del expediente">
            {LVS_TABS.map((t) => (
              <Link key={t} href={`/documentos/lvs/${c.id}?tab=${encodeURIComponent(t)}`} aria-current={tab === t ? "true" : undefined}>
                {tab === t && (
                  <ViewTransition name="seg-active" share="nav-marker">
                    <span className="seg-marker" aria-hidden />
                  </ViewTransition>
                )}
                {t}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!f ? (
        <AbrirExpediente clientId={c.id} canCreate={can("legal.create") && !c.archived_at} />
      ) : tab === "Resumen" ? (
        <Resumen f={f} c={c} pct={p.pct} missing={p.missing} />
      ) : tab === "Ficha maestra" ? (
        <FichaForm client={c} ficha={f} canEdit={canEdit} progress={p} />
      ) : tab === "Historial" ? (
        <section className="panel overflow-hidden">
          <div className="panel-head !py-3">
            <span className="card-title">Historial del expediente</span>
            <span className="text-[12px] text-muted">Cada guardado deja qué campos cambiaron, quién y cuándo</span>
          </div>
          {history.length === 0 ? (
            <div className="px-5 py-8 text-center text-[12.5px] text-faint">Sin movimientos todavía.</div>
          ) : (
            history.map((h) => (
              <div key={h.id} className="row flex items-start gap-3 px-4 py-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13px] text-fg">{h.summary}</span>
                  <span className="text-[11.5px] text-muted">
                    {dateTime(h.at, tz)}
                    {h.actor_name ? ` · ${h.actor_name}` : ""}
                  </span>
                </span>
              </div>
            ))
          )}
        </section>
      ) : (
        <section className="panel empty">
          <span className="icon-tile">
            <Icon name="clock" />
          </span>
          <span className="empty-title">
            {tab} · se construye en la etapa {PROXIMAS[tab]?.etapa}
          </span>
          <span className="empty-text">{PROXIMAS[tab]?.texto}</span>
        </section>
      )}
    </>
  );
}

/** Portada del expediente: avance de cada bloque de un vistazo, sin repetir los datos de la ficha. */
function Resumen({ f, c, pct, missing }: { f: LvsFicha; c: LegalClient; pct: number; missing: string[] }) {
  const si = PREGUNTAS_273A.filter((q) => f[q.key] === true);
  const sinResponder = PREGUNTAS_273A.filter((q) => f[q.key] == null);
  const card = (title: string, value: string, detail: string, href: string, tone: "" | "warn" | "success" = "") => (
    <Link href={`/documentos/lvs/${c.id}?tab=${encodeURIComponent(href)}`} className="card lift flex flex-col gap-1.5 px-5 py-4 text-fg">
      <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted">{title}</span>
      <span className={`text-[22px] font-semibold leading-none tabnum ${tone === "warn" ? "text-warning" : tone === "success" ? "text-success" : ""}`}>{value}</span>
      <span className="text-[12px] text-muted">{detail}</span>
    </Link>
  );
  return (
    <>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {card("Ficha maestra", `${pct}%`, missing.length ? `Falta: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}` : "Completa", "Ficha maestra", pct === 100 ? "success" : "warn")}
        {card("Bienes", si.filter((q) => q.key !== "tiene_juicios" && q.key !== "tiene_bienes_excluidos").length.toString(), sinResponder.length ? `${sinResponder.length} preguntas sin responder` : "categorías declaradas con «sí»", "Bienes")}
        {card("Acreedores", "—", "Etapa 5 · catálogo maestro", "Acreedores")}
        {card("Documentación", "—", "Etapa 2 · requisitos y estados", "Documentación")}
      </div>
      <section className="panel gap-3 px-5 py-4">
        <span className="card-title">Respuestas del artículo 273 A</span>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {PREGUNTAS_273A.map((q) => {
            const v = f[q.key];
            return (
              <div key={q.key} className="flex items-center justify-between gap-3 border-b border-line-soft py-1.5 text-[13px] last:border-0">
                <span className="text-soft">{q.label}</span>
                <span className={`tag ${v === true ? "brand" : v === false ? "" : "warn"}`}>{v === true ? "Sí" : v === false ? "No" : "Sin responder"}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

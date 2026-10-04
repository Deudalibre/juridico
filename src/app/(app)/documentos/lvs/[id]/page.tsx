import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icons";
import { getContext, type LegalClient } from "@/lib/data";
import { clientDrive } from "@/lib/drive-client";
import { dateTime, initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { LVS_ESTADOS, lvsEstadoTone, lvsProgress, type LvsFicha } from "@/lib/lvs";
import { totalDeudas, type AcreedorLite, type Deuda } from "@/lib/lvs-acreedores";
import { CATEGORIAS, EMPTY_BIENES, type BienRow, type BienesPorCategoria } from "@/lib/lvs-bienes";
import { cruzarConDrive, documentosCarpeta, sinPistas, type DriveMatch } from "@/lib/lvs-documentos";
import type { LvsGenerado } from "@/lib/lvs-generados";
import { AbrirExpediente } from "./AbrirExpediente";
import { DocumentacionTab } from "./DocumentacionTab";
import { ExpedienteIndex, type IndexItem } from "./ExpedienteIndex";
import { FichaForm } from "./FichaForm";
import { GeneradosTab } from "./GeneradosTab";

export const metadata = { title: "Expediente LVS" };

type History = { id: number; at: string; actor_name: string | null; kind: string; summary: string | null };
type Chip = { label: string; value: string; tone: "ok" | "warn" | "" };
const pesos = (n: number) => `$ ${n.toLocaleString("es-CL")}`;

/**
 * Expediente LVS en una sola página: cabecera compacta con el estado de todo, índice fijo a la izquierda y los
 * bloques uno tras otro (ficha con bienes, juicios y acreedores; documentación; generados; historial).
 * Nada de pestañas: el operador carga lo que llega del cliente sin cambiar de pantalla.
 */
export default async function ExpedientePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
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
  const p = lvsProgress(f, c);

  if (!f) {
    return (
      <>
        <Cabecera c={c} f={null} chips={[]} />
        <AbrirExpediente clientId={c.id} canCreate={can("legal.create") && !c.archived_at} />
      </>
    );
  }

  // Todo lo del expediente en paralelo: bienes por categoría, deudas, catálogo, generados, plantillas, historial y Drive
  const [bienesRes, deudasRes, catRes, genRes, tplRes, histRes, drive] = await Promise.all([
    Promise.all(CATEGORIAS.map((cat) => supabase.from(cat.table).select("*").eq("client_id", id).order("orden"))),
    supabase.from("legal_lvs_deudas").select("*").eq("client_id", id).order("orden"),
    supabase.from("legal_acreedores").select("id, nombre, rut, alias, email, telefono, naturaleza").eq("activo", true).order("nombre").limit(2000),
    supabase.from("legal_lvs_generados").select("*").eq("client_id", id).order("generado_at", { ascending: false }),
    supabase.from("legal_templates").select("slot, version").not("slot", "is", null).eq("active", true),
    supabase.from("legal_case_history").select("id, at, actor_name, kind, summary").eq("client_id", id).eq("kind", "lvs").order("at", { ascending: false }).limit(100),
    clientDrive(supabase, c),
  ]);
  const bienes: BienesPorCategoria = { ...EMPTY_BIENES };
  CATEGORIAS.forEach((cat, i) => {
    bienes[cat.key] = (bienesRes[i].data ?? []) as BienRow[];
  });
  const totalBienes = CATEGORIAS.filter((cat) => cat.key !== "juicios").reduce((n, cat) => n + bienes[cat.key].length, 0);
  const deudas = (deudasRes.data ?? []) as Deuda[];
  const catalogo = (catRes.data ?? []) as AcreedorLite[];
  const generados = (genRes.data ?? []) as LvsGenerado[];
  const vigentes = generados.filter((g) => g.estado !== "reemplazado");
  const plantillas: Record<string, { version: number } | null> = {};
  for (const row of tplRes.data ?? []) plantillas[row.slot as string] = { version: row.version as number };
  const history = (histRes.data ?? []) as History[];
  const docs = documentosCarpeta(f, bienes, deudas.length);
  const driveFolder = drive.folder ? { name: drive.folder.name, link: drive.folder.webViewLink } : null;
  const driveMatch: Record<number, DriveMatch> = drive.folder ? Object.fromEntries(cruzarConDrive(docs, drive.files)) : {};
  const pedir = docs.filter((d) => !d.generado);
  const enDrive = pedir.filter((d) => driveMatch[d.n]).length;
  const catsSi = CATEGORIAS.filter((cat) => cat.key !== "juicios" && f[cat.pregunta] === true).length;

  const chips: Chip[] = [
    { label: "Ficha", value: `${p.pct}%`, tone: p.pct === 100 ? "ok" : "warn" },
    { label: "Bienes", value: totalBienes.toString(), tone: catsSi > 0 && totalBienes === 0 ? "warn" : "" },
    { label: "Deudas", value: deudas.length ? `${deudas.length} · ${pesos(totalDeudas(deudas))}` : "0", tone: deudas.length ? "" : "warn" },
    { label: "Carpeta", value: driveFolder ? `${enDrive}/${pedir.length} en Drive` : `${pedir.length} documentos`, tone: driveFolder && enDrive === pedir.length ? "ok" : "" },
    { label: "Generados", value: `${vigentes.length}`, tone: vigentes.length ? "ok" : "" },
  ];

  const personales = ["nombre", "RUT", "género", "estado civil", "profesión u oficio", "domicilio", "comuna", "región"];
  const index: IndexItem[] = [
    { id: "cliente", label: "Cliente", estado: p.missing.some((m) => personales.includes(m)) ? "warn" : "ok" },
    { id: "tribunal", label: "Tribunal", estado: f.sj_comuna ? "ok" : "warn" },
    { id: "laboral", label: "Trabajo", estado: f.relacion_laboral == null ? "warn" : "ok" },
    { id: "patrimonio", label: "Patrimonio", estado: catsSi > 0 && totalBienes === 0 ? "warn" : "ok", detalle: totalBienes ? `${totalBienes}` : undefined },
    { id: "juicios", label: "Juicios", estado: f.tiene_juicios == null ? "warn" : "ok", detalle: bienes.juicios.length ? `${bienes.juicios.length}` : undefined },
    { id: "acreedores", label: "Acreedores", estado: deudas.length ? "ok" : "warn", detalle: deudas.length ? `${deudas.length}` : undefined },
    { id: "carta", label: "Carta", estado: f.carta_demanda?.trim() ? "ok" : "warn" },
    { id: "documentacion", label: "Documentación", estado: driveFolder ? (enDrive === pedir.length ? "ok" : "") : "", detalle: `${pedir.length}` },
    { id: "generados", label: "Generados", estado: vigentes.length ? "ok" : "", detalle: vigentes.length ? `${vigentes.length}` : undefined },
    { id: "historial", label: "Historial", estado: "" },
  ];

  return (
    <>
      <Cabecera c={c} f={f} chips={chips} />
      <div className="grid gap-4 lg:grid-cols-[168px_minmax(0,1fr)] lg:items-start">
        <ExpedienteIndex items={index} />
        <div className="flex min-w-0 flex-col gap-3">
          <FichaForm client={c} ficha={f} canEdit={canEdit} progress={p} bienes={bienes} deudas={deudas} catalogo={catalogo} />

          <section id="documentacion" className="flex scroll-mt-3 flex-col gap-3">
            <DocumentacionTab clientId={c.id} docs={sinPistas(docs)} drive={driveMatch} driveFolder={driveFolder} driveConnected={drive.connected} />
          </section>

          <section id="generados" className="flex scroll-mt-3 flex-col gap-3">
            <GeneradosTab clientId={c.id} ficha={f} generados={generados} totalMuebles={bienes.muebles.length} totalDeudas={deudas.length} plantillas={plantillas} canEdit={canEdit && can("documents.edit")} />
          </section>

          <details id="historial" className="panel scroll-mt-3 px-5 py-3">
            <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-fg">
              <Icon name="history" size={14} /> Historial del expediente
              <span className="text-[12px] font-normal text-muted">· {history.length} {history.length === 1 ? "movimiento" : "movimientos"}</span>
            </summary>
            <div className="mt-2 flex flex-col">
              {history.length === 0 ? (
                <span className="py-2 text-[12.5px] text-faint">Sin movimientos todavía.</span>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="flex items-start gap-3 border-t border-line-soft py-2 first:border-0">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[12.5px] text-fg">{h.summary}</span>
                      <span className="text-[11px] text-muted">
                        {dateTime(h.at, tz)}
                        {h.actor_name ? ` · ${h.actor_name}` : ""}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </details>
        </div>
      </div>
    </>
  );
}

/** Cabecera compacta: quién es, en qué estado está y cinco cifras que resumen todo el expediente. */
function Cabecera({ c, f, chips }: { c: LegalClient; f: LvsFicha | null; chips: Chip[] }) {
  return (
    <div className="page-head !items-center gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="avatar solid h-9 w-9 text-[12px]">{initials(c.full_name) || "?"}</span>
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title !text-[17px]">{c.full_name}</h1>
            {f && <span className={`tag ${lvsEstadoTone(f.estado)}`}>{LVS_ESTADOS[f.estado]}</span>}
            {c.archived_at && <span className="tag danger">Causa cerrada</span>}
          </div>
          <span className="text-[12.5px] text-soft">
            {c.rut ? <span className="tabnum">RUT {formatRut(c.rut)}</span> : <span className="text-warning">RUT pendiente</span>}
            {c.internal_number && <span className="tabnum"> · N° {c.internal_number}</span>}
            {" · Liquidación voluntaria simplificada"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((ch) => (
          <span key={ch.label} className="flex items-center gap-1.5 rounded-md border border-line-soft px-2 py-1 text-[12px]" style={{ background: "var(--band)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: ch.tone === "ok" ? "var(--success)" : ch.tone === "warn" ? "var(--warning)" : "var(--border-strong)" }} aria-hidden />
            <span className="text-muted">{ch.label}</span>
            <span className="tabnum font-semibold text-fg">{ch.value}</span>
          </span>
        ))}
        <Link href={`/clientes/${c.id}`} className="btn-outline btn-sm" title="Ficha de la causa (pasos, tareas, Drive)">
          <Icon name="user" size={13} /> Causa
        </Link>
        <Link href="/documentos/lvs" className="btn-ghost btn-sm">
          Todas
        </Link>
      </div>
    </div>
  );
}

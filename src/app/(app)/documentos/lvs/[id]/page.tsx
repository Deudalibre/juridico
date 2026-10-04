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
import { ExpedienteIndex, type IndexGroup, type IndexItem, type ResumenItem } from "./ExpedienteIndex";
import { FichaForm } from "./FichaForm";
import { GeneradosTab } from "./GeneradosTab";

export const metadata = { title: "Expediente LVS" };

type History = { id: number; at: string; actor_name: string | null; kind: string; summary: string | null };
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
      <div className="frame">
        <Cabecera c={c} f={null} />
        <div className="frame-body">
          <AbrirExpediente clientId={c.id} canCreate={can("legal.create") && !c.archived_at} />
        </div>
      </div>
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

  const resumen: ResumenItem[] = [
    { label: "Ficha", value: `${p.pct}%`, tone: p.pct === 100 ? "ok" : "warn", pct: p.pct },
    { label: "Bienes", value: totalBienes.toString(), tone: catsSi > 0 && totalBienes === 0 ? "warn" : totalBienes ? "ok" : "" },
    { label: "Deudas", value: deudas.length ? `${deudas.length} · ${pesos(totalDeudas(deudas))}` : "0", tone: deudas.length ? "ok" : "warn" },
    { label: "Carpeta", value: driveFolder ? `${enDrive}/${pedir.length} en Drive` : `${pedir.length} documentos`, tone: driveFolder && enDrive === pedir.length ? "ok" : "" },
    { label: "Generados", value: `${vigentes.length}`, tone: vigentes.length ? "ok" : "" },
  ];

  const personales = ["nombre", "RUT", "género", "estado civil", "profesión u oficio", "domicilio", "comuna", "región"];
  const ficha: IndexItem[] = [
    { id: "cliente", label: "Cliente", estado: p.missing.some((m) => personales.includes(m)) ? "warn" : "ok" },
    { id: "tribunal", label: "Tribunal", estado: f.sj_comuna ? "ok" : "warn" },
    { id: "laboral", label: "Trabajo", estado: f.relacion_laboral == null ? "warn" : "ok" },
    { id: "patrimonio", label: "Patrimonio", estado: catsSi > 0 && totalBienes === 0 ? "warn" : "ok", detalle: totalBienes ? `${totalBienes}` : undefined },
    { id: "juicios", label: "Juicios", estado: f.tiene_juicios == null ? "warn" : "ok", detalle: bienes.juicios.length ? `${bienes.juicios.length}` : undefined },
    { id: "acreedores", label: "Acreedores", estado: deudas.length ? "ok" : "warn", detalle: deudas.length ? `${deudas.length}` : undefined },
    { id: "carta", label: "Carta", estado: f.carta_demanda?.trim() ? "ok" : "warn" },
  ];
  const carpeta: IndexItem[] = [
    { id: "documentacion", label: "Documentación", estado: driveFolder ? (enDrive === pedir.length ? "ok" : "") : "", detalle: `${pedir.length}` },
    { id: "generados", label: "Generados", estado: vigentes.length ? "ok" : "", detalle: vigentes.length ? `${vigentes.length}` : undefined },
    { id: "historial", label: "Historial", estado: "", detalle: history.length ? `${history.length}` : undefined },
  ];
  const grupos: IndexGroup[] = [
    { title: "Ficha maestra", items: ficha },
    { title: "Carpeta", items: carpeta },
  ];

  return (
    <div className="frame">
      <Cabecera c={c} f={f} />
      <div className="frame-split">
        <aside>
          <ExpedienteIndex groups={grupos} resumen={resumen} />
        </aside>
        <div className="flex min-w-0 flex-col gap-3 p-4" style={{ background: "var(--surface-secondary)" }}>
          <FichaForm client={c} ficha={f} canEdit={canEdit} progress={p} bienes={bienes} deudas={deudas} catalogo={catalogo} />

          <section id="documentacion" className="flex scroll-mt-3 flex-col gap-3">
            <DocumentacionTab clientId={c.id} docs={sinPistas(docs)} drive={driveMatch} driveFolder={driveFolder} driveConnected={drive.connected} />
          </section>

          <section id="generados" className="flex scroll-mt-3 flex-col gap-3">
            <GeneradosTab clientId={c.id} ficha={f} generados={generados} bienes={Object.fromEntries(CATEGORIAS.map((cat) => [cat.key, bienes[cat.key].length]))} totalDeudas={deudas.length} plantillas={plantillas} canEdit={canEdit && can("documents.edit")} />
          </section>

          <details id="historial" className="fold scroll-mt-3 border border-line-soft">
            <summary>
              <span className="flex items-center gap-2">
                <Icon name="history" size={14} /> Historial del expediente
                <span className="text-xs text-faint">{history.length} {history.length === 1 ? "movimiento" : "movimientos"}</span>
              </span>
              <span className="chev">›</span>
            </summary>
            <div className="fold-body !pt-2">
              {history.length === 0 ? (
                <span className="text-[12.5px] text-faint">Sin movimientos todavía.</span>
              ) : (
                <div className="flex flex-col">
                  {history.map((h) => (
                    <div key={h.id} className="grid gap-3.5" style={{ gridTemplateColumns: "14px 1fr" }}>
                      <div className="flex flex-col items-center">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                        <span className="my-1 w-px flex-1 bg-line" aria-hidden />
                      </div>
                      <div className="flex flex-col gap-0.5 pb-3">
                        <span className="text-[13px] text-fg">{h.summary}</span>
                        <span className="text-[11.5px] text-faint">
                          {dateTime(h.at, tz)}
                          {h.actor_name ? ` · ${h.actor_name}` : ""}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

/** Cabecera del marco, como la ficha del lead en el CRM: volver, quién es, estado y acciones. */
function Cabecera({ c, f }: { c: LegalClient; f: LvsFicha | null }) {
  return (
    <div className="frame-head">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/documentos/lvs" className="icon-btn plain shrink-0" aria-label="Volver a solicitudes LVS" title="Volver a solicitudes LVS">
          <span className="inline-flex rotate-180">
            <Icon name="chevron" size={16} />
          </span>
        </Link>
        <span className="avatar h-10 w-10 text-[13px]">{initials(c.full_name) || "?"}</span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title">{c.full_name}</h1>
            {f && <span className={`tag ${lvsEstadoTone(f.estado)}`}>{LVS_ESTADOS[f.estado]}</span>}
            {c.archived_at && <span className="tag danger">Causa cerrada</span>}
          </div>
          <span className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
            {c.rut ? <span className="tabnum font-medium text-fg">RUT {formatRut(c.rut)}</span> : <span className="text-warning">RUT pendiente</span>}
            {c.internal_number && <span className="tabnum">· N° {c.internal_number}</span>}
            <span>· Liquidación voluntaria simplificada</span>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/clientes/${c.id}`} className="btn-outline btn-sm" title="Ficha de la causa (pasos, tareas, Drive)">
          <Icon name="user" size={13} /> Ficha de la causa
        </Link>
      </div>
    </div>
  );
}

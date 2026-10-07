import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { Icon } from "@/components/icons";
import { getContext, type LegalClient } from "@/lib/data";
import { initials } from "@/lib/format";
import { formatRut } from "@/lib/rut";
import { LVS_ESTADOS, lvsEstadoTone, lvsProgress, type LvsFicha } from "@/lib/lvs";
import { totalDeudas, type AcreedorLite, type Deuda } from "@/lib/lvs-acreedores";
import { CATEGORIAS, EMPTY_BIENES, type BienRow, type BienesPorCategoria } from "@/lib/lvs-bienes";
import type { LvsGenerado } from "@/lib/lvs-generados";
import { AbrirExpediente } from "./AbrirExpediente";
import { ExpedienteIndex, type IndexGroup, type IndexItem, type ResumenItem } from "./ExpedienteIndex";
import { FichaForm } from "./FichaForm";
import { GeneradosTab } from "./GeneradosTab";

export const metadata = { title: "Expediente LVS" };

const pesos = (n: number) => `$ ${n.toLocaleString("es-CL")}`;

/**
 * Expediente LVS en una sola página: cabecera compacta con el estado de todo, índice fijo a la izquierda y los
 * bloques uno tras otro (ficha con bienes, juicios y acreedores; documentación; generados; historial).
 * Nada de pestañas: el operador carga lo que llega del cliente sin cambiar de pantalla.
 */
export default function ExpedientePage(props: { params: Promise<{ id: string }> }) {
  // Los datos se cargan dentro de un <Suspense> con el esqueleto compartido: la navegación al expediente es instantánea
  // (Next 16 lo exige en desarrollo) y el contenido entra en streaming.
  return (
    <Suspense fallback={<Loading />}>
      <ExpedienteContent params={props.params} />
    </Suspense>
  );
}

async function ExpedienteContent(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, can } = await getContext();
  // El expediente LVS es del administrador (documents.view); el abogado tramitador trabaja la causa desde Clientes
  if (!can("legal.view") || !can("documents.view")) notFound();
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

  // Todo lo del expediente en paralelo: bienes por categoría, deudas, catálogo, generados y plantillas. (El historial
  // del expediente ya no se muestra aquí: esos movimientos salen en la pestaña Historial de la ficha de la causa.)
  // (La lista «Lo que lleva la carpeta» y el cruce con el Drive se quitaron el 2026-10-06: el expediente es solo para
  // cargar la ficha y generar los documentos rápido.)
  const [bienesRes, deudasRes, catRes, genRes, tplRes] = await Promise.all([
    Promise.all(CATEGORIAS.map((cat) => supabase.from(cat.table).select("*").eq("client_id", id).order("orden"))),
    supabase.from("legal_lvs_deudas").select("*").eq("client_id", id).order("orden"),
    supabase.from("legal_acreedores").select("id, nombre, rut, alias, email, telefono, naturaleza").eq("activo", true).order("nombre").limit(2000),
    supabase.from("legal_lvs_generados").select("*").eq("client_id", id).order("generado_at", { ascending: false }),
    supabase.from("legal_templates").select("slot, version").not("slot", "is", null).eq("active", true),
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
  const catsSi = CATEGORIAS.filter((cat) => cat.key !== "juicios" && f[cat.pregunta] === true).length;

  const resumen: ResumenItem[] = [
    { label: "Ficha", value: `${p.pct}%`, tone: p.pct === 100 ? "ok" : "warn", pct: p.pct },
    { label: "Bienes", value: totalBienes.toString(), tone: catsSi > 0 && totalBienes === 0 ? "warn" : totalBienes ? "ok" : "" },
    { label: "Deudas", value: deudas.length ? `${deudas.length} · ${pesos(totalDeudas(deudas))}` : "0", tone: deudas.length ? "ok" : "warn" },
    { label: "Generados", value: `${vigentes.length}`, tone: vigentes.length ? "ok" : "" },
  ];

  const personales = ["nombre", "RUT", "género", "estado civil", "profesión u oficio", "domicilio", "comuna", "región"];
  const ficha: IndexItem[] = [
    // Cuatro bloques (cliente+tribunal+trabajo, patrimonio+juicios, acreedores, carta): menos desplazamiento
    { id: "cliente", label: "Cliente", estado: p.missing.some((m) => personales.includes(m)) || !f.sj_comuna || f.relacion_laboral == null ? "warn" : "ok" },
    { id: "patrimonio", label: "Patrimonio y juicios", estado: (catsSi > 0 && totalBienes === 0) || f.tiene_juicios == null ? "warn" : "ok", detalle: totalBienes + bienes.juicios.length ? `${totalBienes + bienes.juicios.length}` : undefined },
    { id: "acreedores", label: "Acreedores", estado: deudas.length ? "ok" : "warn", detalle: deudas.length ? `${deudas.length}` : undefined },
    { id: "carta", label: "Carta", estado: f.carta_demanda?.trim() ? "ok" : "warn" },
  ];
  const carpeta: IndexItem[] = [
    { id: "generados", label: "Generados", estado: vigentes.length ? "ok" : "", detalle: vigentes.length ? `${vigentes.length}` : undefined },
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

          <section id="generados" className="flex scroll-mt-3 flex-col gap-3">
            <GeneradosTab clientId={c.id} ficha={f} generados={generados} bienes={Object.fromEntries(CATEGORIAS.map((cat) => [cat.key, bienes[cat.key].length]))} totalDeudas={deudas.length} plantillas={plantillas} canEdit={canEdit && can("documents.edit")} driveFolderUrl={c.drive_folder_url} />
          </section>

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

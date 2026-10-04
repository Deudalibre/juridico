"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { LvsFicha } from "@/lib/lvs";
import { GENERADOS, type GeneradoTipo, type LvsGenerado } from "@/lib/lvs-generados";
import { generadoUrl, generarLvs, setGeneradoEstado } from "../generar-actions";

type Props = { clientId: string; ficha: LvsFicha; generados: LvsGenerado[]; totalMuebles: number; totalDeudas: number; plantillas: Record<string, { version: number } | null>; canEdit: boolean };

const ORDEN: GeneradoTipo[] = ["anexo8", "anexo9", "declaracion_273a", "demanda_lvs"];

/**
 * Documentos que produce la app desde las plantillas Word: un botón por documento (cada uno por separado),
 * la versión vigente con descarga y estado borrador/final, y las versiones reemplazadas plegadas.
 */
export function GeneradosTab({ clientId, ficha, generados, totalMuebles, totalDeudas, plantillas, canEdit }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const vigentes = generados.filter((g) => g.estado !== "reemplazado");
  const anteriores = generados.filter((g) => g.estado === "reemplazado");

  const generar = (tipo: GeneradoTipo) =>
    start(async () => {
      const r = await generarLvs(clientId, tipo);
      if (r.error) toast(r.error, true);
      else {
        toast(r.advertencias?.length ? `Generado con ${r.advertencias.length} ${r.advertencias.length === 1 ? "advertencia" : "advertencias"}` : "Documento generado");
        router.refresh();
      }
    });
  const descargar = (g: LvsGenerado) =>
    start(async () => {
      const r = await generadoUrl(clientId, g.id);
      if (r.error || !r.url) toast(r.error ?? "Sin enlace", true);
      else window.open(r.url, "_blank", "noopener");
    });
  const estado = (g: LvsGenerado, e: "borrador" | "final") =>
    start(async () => {
      const r = await setGeneradoEstado(clientId, g.id, e);
      if (r.error) toast(r.error, true);
      else router.refresh();
    });

  /** Por qué no se puede generar todavía (texto corto) o null si se puede. */
  const bloqueo = (tipo: GeneradoTipo): string | null => {
    const def = GENERADOS[tipo];
    if (tipo === "demanda_lvs") return `Etapa ${def.etapa}`;
    if (!plantillas[tipo]) return "Sin plantilla cargada";
    if (tipo === "anexo9") return totalDeudas === 0 ? "Sin deudas en el bloque Acreedores" : null;
    if (tipo === "anexo8") {
      if (ficha.tiene_bienes_muebles !== true) return "La ficha no declara bienes muebles";
      if (totalMuebles === 0) return "Sin bienes cargados en la ficha";
      return null;
    }
    const faltan = [
      [ficha.genero, "género"],
      [ficha.profesion_oficio, "profesión"],
      [ficha.nacionalidad, "nacionalidad"],
      [ficha.estado_civil, "estado civil"],
      [ficha.domicilio, "domicilio"],
      [ficha.comuna, "comuna"],
      [ficha.region, "región"],
    ].filter(([v]) => !v).map(([, k]) => k as string);
    return faltan.length ? `Falta en la ficha: ${faltan.join(", ")}` : null;
  };

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="panel-head !py-3">
          <div className="flex flex-col">
            <span className="card-title">Documentos generados</span>
            <span className="text-[12px] text-muted">Cada documento se genera por separado desde su plantilla Word; la versión anterior queda como reemplazada.</span>
          </div>
        </div>
        {ORDEN.map((tipo) => {
          const def = GENERADOS[tipo];
          const g = vigentes.find((x) => x.tipo === tipo) ?? null;
          const why = bloqueo(tipo);
          return (
            <div key={tipo} className="row flex min-h-[56px] flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">{def.nombre}</span>
                  {g && <span className={`tag ${g.estado === "final" ? "success" : "brand"}`}>{g.estado === "final" ? "Final" : "Borrador"}</span>}
                  {plantillas[tipo] && <span className="tag">plantilla v{plantillas[tipo]!.version}</span>}
                </span>
                <span className="truncate text-[11.5px] text-muted">
                  {g ? `Generado ${dateTime(g.generado_at, "America/Santiago")}${g.template_version ? ` · con plantilla v${g.template_version}` : ""}${g.advertencias?.length ? ` · ${g.advertencias.length} ${g.advertencias.length === 1 ? "advertencia" : "advertencias"}` : ""}` : why ? why : "Listo para generar"}
                </span>
                {g?.advertencias?.length ? <span className="text-[11.5px] text-warning">{g.advertencias.join(" · ")}</span> : null}
              </span>
              <span className="flex items-center gap-1.5">
                {g && (
                  <>
                    <button className="btn-secondary btn-sm" disabled={pending} onClick={() => descargar(g)}>
                      <Icon name="download" size={13} /> Descargar
                    </button>
                    {canEdit && (g.estado === "final" ? (
                      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => estado(g, "borrador")}>
                        Volver a borrador
                      </button>
                    ) : (
                      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => estado(g, "final")}>
                        <Icon name="check" size={13} /> Marcar final
                      </button>
                    ))}
                  </>
                )}
                {canEdit && (
                  <button className={g ? "btn-outline btn-sm" : "btn-primary btn-sm"} disabled={pending || Boolean(why)} title={why ?? undefined} onClick={() => generar(tipo)}>
                    {pending ? "Generando…" : g ? "Generar de nuevo" : "Generar"}
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </section>
      {anteriores.length > 0 && (
        <details className="panel px-5 py-3">
          <summary className="cursor-pointer text-[12.5px] text-muted">
            {anteriores.length} {anteriores.length === 1 ? "versión anterior" : "versiones anteriores"}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {anteriores.map((g) => (
              <span key={g.id} className="flex items-center gap-2 text-[12.5px] text-soft">
                {GENERADOS[g.tipo].nombre} · {dateTime(g.generado_at, "America/Santiago")} · plantilla v{g.template_version ?? "?"}
                <button className="link-muted text-accent" disabled={pending} onClick={() => descargar(g)}>
                  descargar
                </button>
              </span>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

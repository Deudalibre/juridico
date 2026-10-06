"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { LvsFicha } from "@/lib/lvs";
import { CATEGORIAS } from "@/lib/lvs-bienes";
import { ANEXO_CATEGORIA, GENERADOS, type GeneradoTipo, type LvsGenerado } from "@/lib/lvs-generados";
import { generadoUrl, generarLvs, setGeneradoEstado } from "../generar-actions";

type Props = { clientId: string; ficha: LvsFicha; generados: LvsGenerado[]; bienes: Record<string, number>; totalDeudas: number; plantillas: Record<string, { version: number } | null>; canEdit: boolean };

const ORDEN: GeneradoTipo[] = ["anexo3", "anexo4", "anexo5", "anexo6", "anexo7", "anexo8", "anexo9", "declaracion_273a", "demanda_lvs"];

/**
 * Documentos que produce la app desde las plantillas Word: un botón por documento (cada uno por separado),
 * la versión vigente con descarga y estado borrador/final, y las versiones reemplazadas plegadas.
 */
export function GeneradosTab({ clientId, ficha, generados, bienes, totalDeudas, plantillas, canEdit }: Props) {
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
    // El Anexo 8 siempre se puede generar: lleva fijos los cuatro bienes excluidos (cama, refrigerador, lavadora, comedor)
    if (tipo === "anexo8") return null;
    const cat = ANEXO_CATEGORIA[tipo];
    if (cat) return bienes[cat] ? null : "Sin bienes cargados en la ficha";
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
        {/* Solo títulos y botones (pedido del estudio, 2026-10-06): versión de plantilla, fecha, motivo de bloqueo y
            advertencias van al tooltip del título o del botón, no a la vista */}
        <div className="panel-head !py-2.5">
          <span className="card-title">Documentos</span>
          <span className="text-[12px] text-muted">{vigentes.length ? `${vigentes.length} generados` : "desde las plantillas Word"}</span>
        </div>
        {ORDEN.filter((tipo) => {
          // Los anexos 3 a 7 solo aparecen cuando la ficha marca «Sí» en su categoría
          const cat = ANEXO_CATEGORIA[tipo];
          return !cat || ficha[CATEGORIAS.find((x) => x.key === cat)!.pregunta] === true;
        }).map((tipo) => {
          const def = GENERADOS[tipo];
          const g = vigentes.find((x) => x.tipo === tipo) ?? null;
          const why = bloqueo(tipo);
          const detalle = g
            ? [`Generado ${dateTime(g.generado_at, "America/Santiago")}`, g.template_version ? `plantilla v${g.template_version}` : null, ...(g.advertencias ?? [])].filter(Boolean).join(" · ")
            : (why ?? "Listo para generar") + (plantillas[tipo] ? ` · plantilla v${plantillas[tipo]!.version}` : "") + (tipo === "anexo8" ? " · incluye siempre 4 bienes excluidos: cama de 2 plazas, refrigerador, lavadora y comedor" : "");
          return (
            <div key={tipo} className="row flex min-h-[46px] flex-wrap items-center gap-3 px-4 py-1.5" title={detalle}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${g ? (g.estado === "final" ? "bg-success" : "bg-brand") : why ? "bg-line-strong" : "bg-warning"}`} aria-hidden />
                <span className="truncate text-[13px] font-medium text-fg">{def.nombre}</span>
                {g?.advertencias?.length ? (
                  <span className="text-warning" title={g.advertencias.join(" · ")} aria-label="Con advertencias">
                    <Icon name="alert" size={13} />
                  </span>
                ) : null}
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

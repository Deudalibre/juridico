"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { toast } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { LvsFicha } from "@/lib/lvs";
import { CATEGORIAS } from "@/lib/lvs-bienes";
import { ANEXO_CATEGORIA, GENERADOS, type GeneradoTipo, type LvsGenerado } from "@/lib/lvs-generados";
import { generadoUrl, generarLvs, previsualizarLvs } from "../generar-actions";
import { PreviewDialog } from "./PreviewDialog";

type Props = { clientId: string; ficha: LvsFicha; generados: LvsGenerado[]; bienes: Record<string, number>; totalDeudas: number; plantillas: Record<string, { version: number } | null>; canEdit: boolean; driveFolderUrl: string | null };

const ORDEN: GeneradoTipo[] = ["anexo3", "anexo4", "anexo5", "anexo6", "anexo7", "anexo8", "anexo9", "declaracion_273a", "demanda_lvs"];

type Preview = { tipo: GeneradoTipo; url: string; fileName: string; advertencias: string[] };

/**
 * Documentos que produce la app desde las plantillas Word: un botón por documento (cada uno por separado), la lupa
 * para verlo antes de generarlo, la versión vigente con descarga y enlace al Drive, y las versiones reemplazadas
 * plegadas. Sin «marcar final»: si no gusta, se genera de nuevo.
 */
export function GeneradosTab({ clientId, ficha, generados, bienes, totalDeudas, plantillas, canEdit, driveFolderUrl }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<GeneradoTipo | null>(null);
  const vigentes = generados.filter((g) => g.estado !== "reemplazado");
  const anteriores = generados.filter((g) => g.estado === "reemplazado");
  const enDrive = vigentes.filter((g) => g.drive_link).length;

  const generar = (tipo: GeneradoTipo) =>
    start(async () => {
      const r = await generarLvs(clientId, tipo);
      if (r.error) toast(r.error, true);
      else {
        const n = r.advertencias?.length ?? 0;
        toast(n ? `Generado con ${n} ${n === 1 ? "advertencia" : "advertencias"}` : r.driveLink ? "Documento generado y guardado en el Drive" : "Documento generado");
        setPreview(null);
        router.refresh();
      }
    });
  const ver = (tipo: GeneradoTipo) => {
    setLoadingPreview(tipo);
    start(async () => {
      const r = await previsualizarLvs(clientId, tipo);
      setLoadingPreview(null);
      if (r.error || !r.url) toast(r.error ?? "No se pudo preparar la vista previa.", true);
      else setPreview({ tipo, url: r.url, fileName: r.fileName ?? "", advertencias: r.advertencias ?? [] });
    });
  };
  const descargar = (g: LvsGenerado) =>
    start(async () => {
      const r = await generadoUrl(clientId, g.id);
      if (r.error || !r.url) toast(r.error ?? "Sin enlace", true);
      else window.open(r.url, "_blank", "noopener");
    });

  /** Por qué no se puede generar todavía (texto corto) o null si se puede. */
  const bloqueo = (tipo: GeneradoTipo): string | null => {
    if (!plantillas[tipo]) return "Sin plantilla cargada";
    if (tipo === "demanda_lvs") {
      const faltan = [
        [ficha.genero, "género"],
        [ficha.nacionalidad, "nacionalidad"],
        [ficha.estado_civil, "estado civil"],
        [ficha.profesion_oficio, "profesión"],
        [ficha.domicilio, "domicilio"],
        [ficha.comuna, "comuna"],
        [ficha.region, "región"],
        [ficha.sj_comuna, "tribunal"],
        [ficha.carta_demanda?.trim(), "carta para la demanda"],
        [ficha.relacion_laboral != null, "situación laboral"],
        ...CATEGORIAS.map((cat) => [ficha[cat.pregunta] != null, cat.titulo.toLowerCase()] as const),
      ].filter(([v]) => !v).map(([, k]) => k as string);
      return faltan.length ? `Falta en la ficha: ${faltan.join(", ")}` : null;
    }
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
          <span className="flex min-w-0 items-center gap-2">
            <span className="card-title">Documentos</span>
            {driveFolderUrl && (
              <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline" title="Carpeta del cliente en el Drive del estudio">
                <Icon name="folder" size={12} /> Carpeta en el Drive
              </a>
            )}
          </span>
          <span className="text-[12px] text-muted">{vigentes.length ? `${vigentes.length} generados${enDrive ? ` · ${enDrive} en el Drive` : ""}` : "desde las plantillas Word"}</span>
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
            ? [`Generado ${dateTime(g.generado_at, "America/Santiago")}`, g.template_version ? `plantilla v${g.template_version}` : null, g.drive_link ? "en el Drive" : "solo en la app", ...(g.advertencias ?? [])].filter(Boolean).join(" · ")
            : (why ?? "Listo para generar") + (plantillas[tipo] ? ` · plantilla v${plantillas[tipo]!.version}` : "") + (tipo === "anexo8" ? " · incluye siempre 4 bienes excluidos: cama de 2 plazas, refrigerador, lavadora y comedor" : "");
          return (
            <div key={tipo} className="row flex min-h-[46px] flex-wrap items-center gap-3 px-4 py-1.5" title={detalle}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {/* Verde: generado · ámbar: listo para generar · gris: falta algo. Sin estados borrador/final (2026-10-06):
                    si al operador no le gusta, genera de nuevo y listo */}
                <span className={`h-2 w-2 shrink-0 rounded-full ${g ? "bg-success" : why ? "bg-line-strong" : "bg-warning"}`} aria-hidden />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium text-fg">{def.nombre}</span>
                  {why && !g && (
                    <span id={`why-${tipo}`} className="truncate text-[11px] text-muted" title={why}>
                      {why}
                    </span>
                  )}
                </span>
                {g?.advertencias?.length ? (
                  <span className="text-warning" title={g.advertencias.join(" · ")} aria-label="Con advertencias">
                    <Icon name="alert" size={13} />
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5">
                {/* La lupa: ver cómo queda con los datos de hoy, antes de generar (o de generar de nuevo) */}
                {/* Un botón deshabilitado no muestra su «title»: el motivo va en el envoltorio y el botón deja pasar el mouse */}
                <span className="inline-flex" title={why ? `No se puede generar todavía · ${why}` : g ? "Ver cómo quedaría con los datos actuales de la ficha" : "Ver cómo va a quedar antes de generarlo"}>
                  <button type="button" className="icon-btn disabled:pointer-events-none" disabled={pending || Boolean(why)} aria-label={`Vista previa de ${def.nombre}`} onClick={() => ver(tipo)}>
                    {loadingPreview === tipo ? <span className="text-[11px] text-muted">…</span> : <Icon name="search" size={14} />}
                  </button>
                </span>
                {g && (
                  <>
                    {g.drive_link && (
                      <a href={g.drive_link} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="Abrir en el Google Drive del estudio">
                        <Icon name="external" size={13} /> Drive
                      </a>
                    )}
                    <button className="btn-secondary btn-sm" disabled={pending} onClick={() => descargar(g)}>
                      <Icon name="download" size={13} /> Descargar
                    </button>
                  </>
                )}
                {canEdit && (
                  <span className="inline-flex" title={why ? `No se puede generar todavía · ${why}` : undefined}>
                    <button className={`${g ? "btn-outline btn-sm" : "btn-primary btn-sm"} disabled:pointer-events-none`} disabled={pending || Boolean(why)} aria-describedby={why ? `why-${tipo}` : undefined} onClick={() => generar(tipo)}>
                      {pending && !preview ? "Generando…" : g ? "Generar de nuevo" : "Generar"}
                    </button>
                  </span>
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
      {preview && (
        <PreviewDialog
          title={GENERADOS[preview.tipo].nombre}
          fileName={preview.fileName}
          url={preview.url}
          advertencias={preview.advertencias}
          exists={vigentes.some((x) => x.tipo === preview.tipo)}
          onGenerate={canEdit ? () => generar(preview.tipo) : null}
          generating={pending}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

import Link from "next/link";
import { requirePermission } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { procedureTone } from "@/lib/legal";
import type { LegalTemplate } from "@/lib/templates";
import { Icon } from "@/components/icons";
import { NewTemplate } from "./NewTemplate";
import { DownloadButton } from "./DownloadButton";

// Plantillas Word del estudio: misma estructura que las listas del CRM (cabecera con icono y alta, tabla con acciones al final).
// Cada plantilla se abre en su editor, donde se marcan las variables sobre el propio documento.
const GRID = "grid grid-cols-[minmax(0,2fr)_1.2fr_0.7fr_0.6fr_1fr_220px] items-center gap-3";

// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Plantillas" };

export default async function PlantillasPage() {
  const { supabase, can, tz } = await requirePermission("documents.view");
  const { data, error } = await supabase.from("legal_templates").select("*").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as LegalTemplate[];
  const canEdit = can("documents.edit");

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="folder" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Plantillas</h1>
            <span className="page-subtitle">
              {rows.length === 0 ? "Modelos Word del estudio con sus variables" : `${rows.length} ${rows.length === 1 ? "modelo Word" : "modelos Word"} · las variables se marcan sobre el documento`}
            </span>
          </div>
        </div>
        {canEdit && <NewTemplate />}
      </div>

      <section className="panel overflow-hidden">
        {rows.length === 0 ? (
          <div className="empty">
            <span className="icon-tile">
              <Icon name="folder" />
            </span>
            <span className="empty-title">Aún no hay plantillas</span>
            <span className="empty-text">
              Sube un Word del estudio (declaración jurada, anexos, demanda…). Después, en el editor, seleccionas cada dato que cambia por cliente y lo conviertes en variable.
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div role="table" aria-label="Plantillas" className="min-w-[900px]">
              <div className={`${GRID} th-band border-y border-line px-4 py-2.5`} role="row">
                {["Plantilla", "Procedimiento", "Variables", "Versión", "Actualizada", "Acciones"].map((h) => (
                  <div key={h} className="th" role="columnheader">
                    {h}
                  </div>
                ))}
              </div>
              {rows.map((t) => (
                <div key={t.id} className={`${GRID} row min-h-[54px] px-4 py-1.5`} role="row">
                  <div className="flex min-w-0 flex-col" role="cell">
                    <Link href={`/plantillas/${t.id}`} className="truncate text-[13px] font-medium leading-4 text-fg hover:text-accent">
                      {t.name}
                    </Link>
                    <span className="truncate text-[11px] leading-[14px] text-muted">
                      {t.file_name ?? "plantilla.docx"}
                      {t.description ? ` · ${t.description}` : ""}
                    </span>
                  </div>
                  <div role="cell">{t.procedure_type ? <span className={`tag ${procedureTone(t.procedure_type)}`}>{t.procedure_type}</span> : <span className="text-[12.5px] text-faint">Todos</span>}</div>
                  <div role="cell" className="tabnum text-[13px] text-soft">
                    {t.variables.length}
                  </div>
                  <div role="cell" className="tabnum text-[12.5px] text-muted">
                    v{t.version}
                  </div>
                  <div role="cell" className="truncate text-[12.5px] text-soft">
                    {dateTime(t.updated_at, tz)}
                  </div>
                  <div role="cell" className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <Link href={`/plantillas/${t.id}`} className="btn-outline btn-sm">
                      <Icon name="edit" size={14} /> {canEdit ? "Editar" : "Ver"}
                    </Link>
                    <DownloadButton id={t.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

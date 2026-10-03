import { requirePermission } from "@/lib/data";
import { FICHA_FIELDS, type CatalogVariable, type LegalTemplate } from "@/lib/templates";
import { Icon } from "@/components/icons";
import { HelpPop } from "@/components/HelpPop";
import { VariablesManager } from "./VariablesManager";

/**
 * Catálogo de variables del estudio: cada dato que cambia por cliente se define una vez ({domicilio}, {comuna}…)
 * y sirve para todas las plantillas. Al subir un Word, los marcadores que coinciden se reconocen solos;
 * en el editor se ofrecen para marcar sin volver a definirlos.
 */
// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Variables del estudio" };

export default async function VariablesPage() {
  const { supabase, can } = await requirePermission("documents.view");
  const [{ data: rows, error }, { data: templates }] = await Promise.all([
    supabase.from("legal_variables").select("*").order("position").order("label"),
    supabase.from("legal_templates").select("id, name, variables").eq("active", true),
  ]);
  if (error) throw new Error(error.message);
  const catalog = (rows ?? []) as CatalogVariable[];
  // En cuántas plantillas se usa cada variable (por nombre del marcador)
  const usage: Record<string, string[]> = {};
  for (const t of (templates ?? []) as Pick<LegalTemplate, "id" | "name" | "variables">[]) {
    for (const v of t.variables ?? []) (usage[v.name] ??= []).push(t.name);
  }

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="tag" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Variables del estudio</h1>
            <span className="page-subtitle">
              {catalog.length === 0 ? "Define una vez cada dato que cambia por cliente; servirá para todos los Word" : `${catalog.length} ${catalog.length === 1 ? "variable" : "variables"} del estudio · ${FICHA_FIELDS.length} automáticas de la ficha`}
            </span>
          </div>
        </div>
        <HelpPop label="Cómo funciona" title="Variables y plantillas">
          <span>
            En el Word, cada dato que cambia por cliente va entre llaves: <code>{"{domicilio}"}</code>. Aquí se define ese nombre una sola vez, con su etiqueta, tipo y de dónde sale el valor.
          </span>
          <span>Al subir una plantilla, los marcadores que coinciden con el catálogo se reconocen solos. En el editor, al seleccionar un texto, el catálogo aparece listo para marcar.</span>
          <span>Las de la ficha (nombre, RUT, rol, tribunal…) ya existen y se rellenan solas; no hace falta crearlas.</span>
        </HelpPop>
      </div>

      <VariablesManager catalog={catalog} usage={usage} canEdit={can("documents.edit")} canManage={can("documents.manage")} />
    </>
  );
}

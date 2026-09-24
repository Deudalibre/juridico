import { requirePermission } from "@/lib/data";
import { Icon } from "@/components/icons";

// Etapa 4 (documentos generados, versiones y paquetes). Depende del gestor de plantillas.
export default async function DocumentosPage() {
  await requirePermission("documents.view");
  return (
    <>
      <div className="page-head !min-h-0 !py-3">
        <div className="flex flex-col">
          <h1 className="page-title">Documentos generados</h1>
          <span className="text-[12.5px] text-muted">Cada generación con su cliente, responsable, fecha, versión de plantilla y datos usados</span>
        </div>
      </div>
      <section className="panel empty">
        <span className="icon-tile">
          <Icon name="report" />
        </span>
        <span className="empty-title">Todavía no se generan documentos</span>
        <span className="empty-text">Esta sección se habilita cuando exista al menos una plantilla configurada y habilitada para producción.</span>
      </section>
    </>
  );
}

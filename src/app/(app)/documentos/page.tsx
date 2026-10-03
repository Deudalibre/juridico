import { requirePermission } from "@/lib/data";
import { Icon } from "@/components/icons";

// Etapa 4 (documentos generados, versiones y paquetes). Depende del gestor de plantillas.
// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  await requirePermission("documents.view");
  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="report" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Documentos generados</h1>
            <span className="page-subtitle">Cada generación con su cliente, responsable, fecha, versión de plantilla y datos usados</span>
          </div>
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

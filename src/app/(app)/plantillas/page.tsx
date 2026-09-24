import { requirePermission } from "@/lib/data";
import { Icon } from "@/components/icons";

// Etapa 3 (gestor de plantillas Word). Hasta tener las plantillas reales del estudio no hay
// modelo de marcadores que mostrar: esta pantalla lo dice tal cual, sin simular contenido.
export default async function PlantillasPage() {
  await requirePermission("documents.view");
  return (
    <>
      <div className="page-head !min-h-0 !py-3">
        <div className="flex flex-col">
          <h1 className="page-title">Plantillas</h1>
          <span className="text-[12.5px] text-muted">Modelos Word del estudio, sus versiones y el mapa de campos</span>
        </div>
      </div>
      <section className="panel empty">
        <span className="icon-tile">
          <Icon name="folder" />
        </span>
        <span className="empty-title">Pendiente: mapa de plantillas</span>
        <span className="empty-text">
          El gestor se construye sobre las plantillas reales (.docx) del estudio: primero se analizan y se prepara el mapa documento → sección → campo →
          fuente → regla de inclusión → validación. Deja los archivos en la carpeta <code>plantillas/</code> del proyecto.
        </span>
      </section>
    </>
  );
}

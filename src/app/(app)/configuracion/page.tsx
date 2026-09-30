import { getStatuses, requirePermission } from "@/lib/data";
import { driveState, googleConfigured } from "@/lib/google";
import { DriveCard } from "./DriveCard";

// Configuración del área jurídica (solo legal.settings): Google Drive del estudio, estados de la causa y proveedor de IA.
export default async function ConfiguracionPage() {
  const { supabase } = await requirePermission("legal.settings");
  const [statuses, drive] = await Promise.all([getStatuses(supabase), driveState(supabase)]);
  const iaConfigured = Boolean(process.env.IA_PROVIDER && process.env.IA_API_KEY);
  return (
    <>
      <div className="page-head !min-h-0 !py-3">
        <div className="flex flex-col">
          <h1 className="page-title">Configuración</h1>
          <span className="text-[12.5px] text-muted">Google Drive, estados, catálogos y proveedor de IA del área jurídica</span>
        </div>
      </div>
      <div className="grid items-start gap-2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,340px),1fr))" }}>
        <DriveCard configured={googleConfigured()} connected={drive.connected} email={drive.email} rootName={drive.rootName} rootId={drive.rootId} error={drive.error} />
        <section className="panel gap-3 px-5 py-4">
          <span className="card-title">Estados de la causa</span>
          <div className="flex flex-col">
            {statuses.map((s) => (
              <div key={s.id} className="list-row py-2 text-[13px]">
                <span>{s.name}</span>
                {s.is_terminal && <span className="badge neutral">terminal</span>}
              </div>
            ))}
          </div>
        </section>
        <section className="panel gap-3 px-5 py-4">
          <span className="card-title">Proveedor de IA (relato de insolvencia)</span>
          <span className="text-[13px] text-soft">
            {iaConfigured ? (
              <span className="badge success">Configurado</span>
            ) : (
              <>
                <span className="badge warning">No conectado</span>
                <span className="mt-2 block">
                  La IA solo se usará para redactar la propuesta de relación de hechos a partir del relato del cliente, nunca para el resto de la ficha. Faltan{" "}
                  <code>IA_PROVIDER</code> e <code>IA_API_KEY</code> en <code>.env.local</code>.
                </span>
              </>
            )}
          </span>
        </section>
      </div>
    </>
  );
}

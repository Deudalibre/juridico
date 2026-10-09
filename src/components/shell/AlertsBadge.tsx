import { connection } from "next/server";
import { getContext } from "@/lib/data";

/**
 * Insignia de «Revisión»: causas activas sin revisión hace más de 30 días (nunca revisadas o con la última revisión
 * anterior a 30 días), el mismo indicador del resumen diario por correo (/api/cron/alertas). Se cuenta aparte del marco
 * y llega en streaming: la barra no espera a la base para pintarse.
 */
export async function AlertsBadge() {
  const { supabase } = await getContext();
  // La sesión viene de la caché privada, así que nada antes de esta línea es dinámico: se declara que la insignia se
  // calcula en cada petición (Cache Components) antes de leer el reloj; si no, Next la marca como valor inestable
  await connection();
  const ahora = new Date();
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000).toISOString();
  const { count } = await supabase.from("legal_clients").select("id", { count: "exact", head: true }).is("archived_at", null).or(`last_review_at.is.null,last_review_at.lt.${hace30}`);
  const n = count ?? 0;
  if (n <= 0) return null;
  return (
    <span className="rail-badge badge-alert" title="Causas sin revisión hace más de 30 días">
      {n > 99 ? "99+" : n}
    </span>
  );
}

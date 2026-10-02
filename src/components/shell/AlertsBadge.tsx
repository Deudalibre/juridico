import { getContext } from "@/lib/data";

/**
 * Insignia de «Revisión»: causas activas que tocan revisar (nunca revisadas o con la fecha cumplida) + tareas vencidas.
 * Se cuenta aparte del marco y llega en streaming: la barra no espera a la base para pintarse.
 */
export async function AlertsBadge() {
  const { supabase } = await getContext();
  const now = new Date().toISOString();
  const [{ count: toReview }, { count: overdue }] = await Promise.all([
    supabase.from("legal_clients").select("id", { count: "exact", head: true }).is("archived_at", null).or(`next_review_at.is.null,next_review_at.lte.${now}`),
    supabase.from("legal_tasks").select("id", { count: "exact", head: true }).eq("status", "pendiente").lt("due_at", now),
  ]);
  const n = (toReview ?? 0) + (overdue ?? 0);
  if (n <= 0) return null;
  return (
    <span className="rail-badge" title="Causas por revisar o tareas vencidas">
      {n > 99 ? "99+" : n}
    </span>
  );
}

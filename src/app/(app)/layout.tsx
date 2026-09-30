import { Suspense } from "react";
import { getContext } from "@/lib/data";
import { AppShell } from "@/components/shell/AppShell";
import { Toaster } from "@/components/Toaster";
import { Realtime } from "@/components/Realtime";
import { signOut } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

// El área jurídica exige legal.view (rol jurídico o administrador). Un ejecutivo o coordinador
// del CRM entra con su cuenta pero no ve nada: la base lo bloquea igual (RLS).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile, permissions, can } = await getContext();

  if (!profile.active || !can("legal.view")) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="card flex max-w-md flex-col gap-3 p-7">
          <span className="card-title">{profile.active ? "Sin acceso al área jurídica" : "Tu cuenta está desactivada"}</span>
          <span className="text-[13.5px] leading-relaxed text-soft">
            {profile.active
              ? "Tu cuenta no tiene el rol jurídico ni el de administrador. Pide al administrador que te lo asigne desde el CRM (Configuración → Usuarios y reglas)."
              : "Pide al administrador que la vuelva a activar."}
          </span>
          <div className="flex gap-2">
            <a href={CRM_URL} className="btn-secondary btn-sm">
              Ir al CRM
            </a>
            <form action={signOut}>
              <button className="btn-ghost btn-sm">Cerrar sesión</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Insignia de «Revisión»: causas activas que tocan revisar (nunca revisadas o con la fecha cumplida) + tareas vencidas
  const now = new Date().toISOString();
  const [{ count: toReview }, { count: overdue }] = await Promise.all([
    supabase.from("legal_clients").select("id", { count: "exact", head: true }).is("archived_at", null).or(`next_review_at.is.null,next_review_at.lte.${now}`),
    supabase.from("legal_tasks").select("id", { count: "exact", head: true }).eq("status", "pendiente").lt("due_at", now),
  ]);

  return (
    <>
      {/* Sin Suspense alrededor del marco: con él, notFound() y redirect() de las páginas salían con estado 200 */}
      <AppShell userId={user.id} name={profile.full_name} role={profile.role} permissions={permissions} alerts={(toReview ?? 0) + (overdue ?? 0)} crmUrl={CRM_URL}>
        {children}
      </AppShell>
      <Suspense>
        <Toaster />
      </Suspense>
      <Realtime userId={user.id} />
    </>
  );
}

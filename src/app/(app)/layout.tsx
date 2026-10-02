import { Suspense } from "react";
import { getContext } from "@/lib/data";
import { AppShell } from "@/components/shell/AppShell";
import { AlertsBadge } from "@/components/shell/AlertsBadge";
import { ShellSkeleton } from "@/components/shell/ShellSkeleton";
import { Toaster } from "@/components/Toaster";
import { Realtime } from "@/components/Realtime";
import { signOut } from "@/app/(auth)/actions";

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

/**
 * Cache Components (Next 16): el marco vacío se prerenderiza como cáscara estática y se sirve al instante;
 * lo que depende de la sesión (nombre, permisos, menú) llega en streaming detrás de este Suspense,
 * y la insignia de «Revisión», que consulta la base, detrás de otro más adentro. Las páginas traen su
 * propio loading.tsx, así que cada pantalla también entra en streaming sin esperar al servidor.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

// El área jurídica exige legal.view (rol jurídico o administrador). Un ejecutivo o coordinador
// del CRM entra con su cuenta pero no ve nada: la base lo bloquea igual (RLS).
async function Shell({ children }: { children: React.ReactNode }) {
  const { user, profile, permissions, can } = await getContext();

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

  return (
    <>
      <AppShell
        userId={user.id}
        name={profile.full_name}
        role={profile.role}
        permissions={permissions}
        badge={
          <Suspense fallback={null}>
            <AlertsBadge />
          </Suspense>
        }
        crmUrl={CRM_URL}
      >
        {children}
      </AppShell>
      <Suspense>
        <Toaster />
      </Suspense>
      <Realtime userId={user.id} />
    </>
  );
}

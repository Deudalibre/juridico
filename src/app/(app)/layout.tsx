import { Suspense } from "react";
import { getContext } from "@/lib/data";
import { Shell } from "@/components/Shell";
import { Toaster } from "@/components/Toaster";
import { signOut } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

// El área jurídica exige legal.view (rol jurídico o administrador). Un ejecutivo o coordinador
// del CRM entra con su cuenta pero no ve nada: la base lo bloquea igual (RLS).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, permissions, can } = await getContext();

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
      <Shell name={profile.full_name} role={profile.role} permissions={permissions} crmUrl={CRM_URL}>
        {children}
      </Shell>
      <Suspense>
        <Toaster />
      </Suspense>
    </>
  );
}

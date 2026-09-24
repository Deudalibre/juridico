import { signOut } from "@/app/(auth)/actions";

const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

// Página estática (no redirige): evita un bucle con requirePermission → /sin-acceso → /clientes → …
export default function SinAcceso() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card flex max-w-md flex-col gap-3 p-7">
        <span className="card-title">Sin acceso al área jurídica</span>
        <span className="text-[13.5px] leading-relaxed text-soft">
          Tu cuenta no tiene el rol jurídico ni el de administrador. Pide al administrador que te lo asigne desde el CRM (Configuración → Usuarios y
          reglas).
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

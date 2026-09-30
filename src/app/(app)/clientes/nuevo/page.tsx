import Link from "next/link";
import { requirePermission } from "@/lib/data";
import { NuevoForm } from "./NuevoForm";

// Alta manual de un cliente. Los que vienen del CRM se crean desde la ficha del lead contratado.
export default async function NuevoClientePage() {
  await requirePermission("legal.create");
  return (
    <>
      <div className="panel gap-2 px-5 py-4">
        <Link href="/clientes" className="link-muted self-start text-xs">
          ← Volver a clientes
        </Link>
        <h1 className="page-title">Nuevo cliente</h1>
        <span className="page-subtitle">Solo lo básico para abrir la ficha; el resto se completa dentro.</span>
      </div>
      <NuevoForm />
    </>
  );
}

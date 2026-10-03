import Link from "next/link";
import { requirePermission } from "@/lib/data";
import { Icon } from "@/components/icons";
import { NuevoForm } from "./NuevoForm";

// Alta manual de un cliente. Los que vienen del CRM se crean desde la ficha del lead contratado.
// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Nuevo cliente" };

export default async function NuevoClientePage() {
  await requirePermission("legal.create");
  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="plus" size={18} />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="page-title">Nuevo cliente</h1>
            <span className="page-subtitle">Solo lo básico para abrir la ficha; el resto se completa dentro.</span>
          </div>
        </div>
        <Link href="/clientes" className="btn-secondary">
          ← Volver a clientes
        </Link>
      </div>
      <NuevoForm />
    </>
  );
}

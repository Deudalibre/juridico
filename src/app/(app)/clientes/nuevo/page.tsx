import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { requirePermission } from "@/lib/data";
import { Icon } from "@/components/icons";
import { NuevoForm } from "./NuevoForm";

// Alta manual de un cliente. Los que vienen del CRM se crean desde la ficha del lead contratado.
// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Nuevo cliente" };

/**
 * La carga de datos vive en NuevoClienteContent, dentro de un <Suspense> con el esqueleto de loading.tsx. Así la navegación a
 * esta pantalla es instantánea (Next 16 lo valida en desarrollo): marco y esqueleto aparecen al clic y los datos
 * entran en streaming. loading.tsx solo cubre la carga directa, no la navegación entre pantallas.
 */
export default function NuevoClientePage() {
  return (
    <Suspense fallback={<Loading />}>
      <NuevoClienteContent />
    </Suspense>
  );
}

async function NuevoClienteContent() {
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

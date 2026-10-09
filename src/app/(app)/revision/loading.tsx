import { TableSkeleton } from "@/components/TableSkeleton";

// Esqueleto de la vista Revisión: cabecera y una tabla de 8 filas con sus 6 columnas, mientras el servidor trae los datos.
export default function Loading() {
  return (
    <>
      <div className="route-progress" aria-hidden />
      <div className="fade-in flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <div className="skeleton h-7 w-56" />
            <div className="skeleton h-4 w-80 max-w-full" />
          </div>
          <div className="skeleton h-10 w-32" />
        </div>
        <TableSkeleton columns={6} />
      </div>
    </>
  );
}

/**
 * Esqueleto de tabla para los loading.tsx de las vistas principales: 8 filas falsas con el mismo número de columnas que
 * la tabla real, con la clase .skeleton del sistema (brillo animado). Aparece en cuanto se navega, antes de los datos.
 */
export function TableSkeleton({ columns, rows = 8, header = true }: { columns: number; rows?: number; header?: boolean }) {
  const anchos = [68, 52, 80, 44, 60, 36, 72, 48];
  return (
    <div className="panel overflow-hidden" aria-busy="true" aria-label="Cargando la tabla">
      {header && (
        <div className="th-band flex items-center gap-4 border-b border-line px-4 py-2.5">
          {Array.from({ length: columns }, (_, i) => (
            <div key={i} className="skeleton h-3 flex-1" style={{ maxWidth: `${anchos[i % anchos.length]}%` }} />
          ))}
        </div>
      )}
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-line-soft px-4 py-2.5 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <div key={c} className="skeleton h-4 flex-1 rounded" style={{ maxWidth: `${anchos[(r + c) % anchos.length]}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

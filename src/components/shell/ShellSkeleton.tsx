/**
 * Marco vacío que se sirve de inmediato (forma parte de la cáscara estática que Next prerenderiza):
 * barra, panel superior y un esqueleto del contenido. El marco real, que necesita la sesión,
 * llega en streaming unos milisegundos después y lo reemplaza sin salto.
 */
export function ShellSkeleton() {
  return (
    <div className="shell" aria-busy="true" aria-label="Cargando">
      <nav className="rail">
        <span className="rail-brand">DL</span>
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className="rail-item">
            <span className="skeleton h-4 w-4 !rounded" />
            <span className="skeleton h-2 w-8" />
          </span>
        ))}
      </nav>
      <div className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span className="skeleton h-3.5 w-28" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="skeleton h-8 w-8 !rounded-lg" />
            <span className="skeleton h-8 w-8 !rounded-lg" />
            <span className="skeleton h-8 w-8 !rounded-full" />
          </div>
        </header>
        <main className="content">
          <div className="route-progress" aria-hidden />
          <div className="fade-in flex flex-col gap-7">
            <div className="flex items-end justify-between gap-4">
              <div className="flex flex-col gap-2.5">
                <div className="skeleton h-7 w-56" />
                <div className="skeleton h-4 w-80 max-w-full" />
              </div>
              <div className="skeleton h-10 w-32" />
            </div>
            <div className="card flex flex-col gap-4 p-6">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton h-8 w-8 shrink-0 !rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <div className="skeleton h-3.5" style={{ width: `${40 + ((i * 17) % 35)}%` }} />
                    <div className="skeleton h-3 w-1/4" />
                  </div>
                  <div className="skeleton h-3.5 w-16" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// Esqueleto mientras el servidor carga los datos de la siguiente página (mismo que el CRM).
export default function Loading() {
  return (
    <>
      <div className="route-progress" aria-hidden />
      <div className="fade-in flex flex-col gap-7" aria-busy="true" aria-label="Cargando">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <div className="skeleton h-7 w-56" />
            <div className="skeleton h-4 w-80 max-w-full" />
          </div>
          <div className="skeleton h-10 w-32" />
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card flex flex-col gap-3 px-[22px] py-5">
              <div className="skeleton h-3.5 w-24" />
              <div className="skeleton h-7 w-28" />
              <div className="skeleton h-3 w-36" />
            </div>
          ))}
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
    </>
  );
}

"use client";

import { useState, type ReactNode } from "react";

/**
 * Tablas con más de 6 columnas: por defecto se ven las que el operador mira siempre y el resto se despliega con
 * «Más columnas ▾» (no persiste: al recargar vuelven ocultas). El contenedor lleva `group` y `data-cols`, así las celdas
 * secundarias se ocultan con `group-data-[cols=menos]:hidden` y la rejilla cambia con `group-data-[cols=menos]:grid-cols-[…]`.
 */
export function MasColumnas({ children, boton }: { children: ReactNode; /** Dónde va el botón: «arriba» (sobre la tabla, a la derecha) o «cabecera» (lo pinta quien llama) */ boton?: "arriba" }) {
  const [todas, setTodas] = useState(false);
  return (
    <div className="group flex flex-col gap-2" data-cols={todas ? "todas" : "menos"}>
      {boton === "arriba" && (
        <div className="flex justify-end px-1">
          <MasColumnasBoton todas={todas} onToggle={() => setTodas((v) => !v)} />
        </div>
      )}
      {children}
    </div>
  );
}

export function MasColumnasBoton({ todas, onToggle }: { todas: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={onToggle} aria-expanded={todas} title={todas ? "Ocultar las columnas secundarias" : "Mostrar todas las columnas"}>
      {todas ? "Menos columnas ▴" : "Más columnas ▾"}
    </button>
  );
}

"use client";

import { ICON_NAMES, SPRITE, type IconName } from "@/components/icon-names";

// Iconografía: Lucide, un solo trazo (1.6) y un solo tamaño por contexto (20 en navegación, 16 en línea).
// Los trazos viven en un sprite estático (public/icons.svg) que el navegador baja una vez y guarda en caché, y el
// trazo y el color salen de la clase .lucide en globals.css: así cada <Icon> pesa unos 100 bytes en el HTML y unos
// 45 en la carga de React, en vez de repetir los trazos en ambos (en una lista de 40 clientes son más de 400 iconos).
export function Icon({ name, size = 20 }: { name: IconName | string; size?: number }) {
  if (!(name in ICON_NAMES)) return null;
  return (
    <svg width={size} height={size} className="lucide sprite" aria-hidden="true">
      <use href={`${SPRITE}#i-${name}`} />
    </svg>
  );
}

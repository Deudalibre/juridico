"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { fechaPjud, type Cuaderno } from "@/lib/pjud-data";

const POR_PAGINA = 10;

/** La Historia de la causa como en la OJV: un cuaderno a la vez (pestañas si hay varios), folio más reciente arriba, de 10 en 10. */
export function PjudCuadernos({ cuadernos }: { cuadernos: Cuaderno[] }) {
  const [activo, setActivo] = useState(0);
  const [pagina, setPagina] = useState(1);
  const cuaderno = cuadernos[activo] ?? cuadernos[0];
  const filas = useMemo(() => (cuaderno?.actuaciones ?? []).slice().sort((a, b) => (b.folio ?? -1) - (a.folio ?? -1) || (b.fecha_registro ?? "").localeCompare(a.fecha_registro ?? "")), [cuaderno]);
  const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas);
  const visibles = filas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);

  if (!cuadernos.length) return <div className="pjud-nada">Sin cuadernos publicados</div>;

  return (
    <>
      <div className="pjud-seccion pjud-seccion-tabs">
        <span>Historia</span>
        {cuadernos.length > 1 && (
          <div className="pjud-tabs" role="tablist" aria-label="Cuadernos">
            {cuadernos.map((c, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === activo}
                className={i === activo ? "activo" : ""}
                onClick={() => {
                  setActivo(i);
                  setPagina(1);
                }}
              >
                {c.nombre || `Cuaderno ${i + 1}`}
                <span className="pjud-tab-n">{c.actuaciones.length}</span>
              </button>
            ))}
          </div>
        )}
        {cuadernos.length === 1 && <span className="pjud-cuaderno-unico">Cuaderno: {cuaderno.nombre || "Principal"}</span>}
      </div>
      <table className="pjud-tabla pjud-historia">
        <thead>
          <tr>
            <th className="pjud-num">N°</th>
            <th className="pjud-num">Folio</th>
            <th>Trámite</th>
            <th>Fec. Diligencia</th>
            <th>Fec. Registro</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {visibles.length === 0 ? (
            <tr>
              <td colSpan={6} className="pjud-nada">
                Este cuaderno no tiene actuaciones todavía
              </td>
            </tr>
          ) : (
            visibles.map((a, i) => (
              <tr key={`${a.folio ?? "s"}-${i}`}>
                <td className="pjud-num pjud-muted">{(pag - 1) * POR_PAGINA + i + 1}</td>
                <td className="pjud-num">{a.folio ?? "—"}</td>
                <td>
                  <span className="pjud-tramite">{a.tramite || "—"}</span>
                  {a.etapa && <span className="pjud-etapa">{a.etapa}</span>}
                </td>
                <td className="pjud-num pjud-diligencia">{a.fecha_diligencia ? fechaPjud(a.fecha_diligencia) : ""}</td>
                <td className="pjud-num pjud-registro">{fechaPjud(a.fecha_registro)}</td>
                <td className="pjud-desc">
                  {a.descripcion}
                  {a.tiene_documento && (
                    <span className="pjud-doc" title="Con documento en el PJUD">
                      <Icon name="folder" size={11} />
                    </span>
                  )}
                  {a.foja && <span className="pjud-foja">foja {a.foja}</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {paginas > 1 && (
        <div className="pjud-paginas">
          <span>
            {filas.length} actuaciones · página {pag} de {paginas}
          </span>
          <span className="pjud-paginas-botones">
            <button type="button" disabled={pag <= 1} onClick={() => setPagina(pag - 1)} aria-label="Página anterior">
              ‹ Anterior
            </button>
            <button type="button" disabled={pag >= paginas} onClick={() => setPagina(pag + 1)} aria-label="Página siguiente">
              Siguiente ›
            </button>
          </span>
        </div>
      )}
    </>
  );
}

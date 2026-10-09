import { Icon } from "@/components/icons";
import { PJUD_BASE } from "@/lib/pjud";
import { ROTULO_PARTE, fechaPjud, haceCuanto, tonoEstado, type PjudCausaData } from "@/lib/pjud-data";
import { PjudCuadernos } from "./PjudCuadernos";
import { SincronizarPjud } from "./SincronizarPjud";

/**
 * Réplica de la consulta unificada del Poder Judicial para la causa: cabecera como la Oficina Judicial Virtual (rol,
 * fecha de ingreso, carátula, estados, procedimiento, etapa, tribunal), litigantes, y la Historia por cuaderno. Los
 * datos vienen de pjud_causa_data, que se sincroniza a diario a las 12:00 desde el estudio (el PJUD bloquea las IP de
 * Vercel). Los estilos viven en globals.css bajo `.pjud`.
 */
export function PjudFicha({ data, rol, tribunal, pjudUrl, clientId, canSync }: { data: PjudCausaData | null; rol: string | null; tribunal: string | null; pjudUrl: string | null; clientId: string; canSync: boolean }) {
  const enlace = pjudUrl || `${PJUD_BASE}/consultaUnificada.php`;
  const sinRol = !rol || !tribunal;
  const tono = tonoEstado(data?.estado_proc);
  const partes = data?.partes ?? [];
  const tipoDe = (t: string) => (t.includes("demandante") || t === "deudor" || t === "abogado_deudor" ? "pjud-dte" : t.includes("demandado") || t === "acreedor" || t === "abogado_acreedor" ? "pjud-ddo" : "");

  return (
    <section className="pjud" aria-label="Datos del Poder Judicial">
      <div className="pjud-top">
        <span className="pjud-top-titulo">
          <Icon name="court" size={15} />
          Poder Judicial · Consulta unificada de causas
        </span>
        <span className="pjud-top-sync">
          {data?.synced_at ? `Actualizado ${haceCuanto(data.synced_at)}` : "Sin sincronizar todavía"}
          {canSync && !sinRol && <SincronizarPjud clientId={clientId} nunca={!data?.synced_at} />}
        </span>
      </div>

      {data?.error && (
        <div className="pjud-aviso" role="status">
          <Icon name="alert" size={14} />
          <span>
            No se pudo sincronizar{data.error_at ? ` (${haceCuanto(data.error_at)})` : ""}: {data.error}
            {data.synced_at ? ` · Se muestran los últimos datos disponibles, de ${fechaPjud(data.synced_at)}.` : ""}
          </span>
        </div>
      )}

      {sinRol ? (
        <div className="pjud-vacio">La causa no tiene rol y tribunal: cárgalos en «Antecedentes» para consultar el Poder Judicial.</div>
      ) : !data?.synced_at ? (
        <div className="pjud-vacio">
          Todavía no hay datos del Poder Judicial para {rol} · {tribunal}. Se sincroniza a diario a las 12:00 desde el estudio.
        </div>
      ) : (
        <>
          {/* Cabecera, como la ficha de la OJV */}
          <table className="pjud-cab">
            <tbody>
              <tr>
                <td>
                  <strong>ROL:</strong> <span className="pjud-rol">{data.rol}</span>
                </td>
                <td>
                  <strong>F. Ing.:</strong> {fechaPjud(data.fecha_ingreso) || "—"}
                </td>
                <td className="pjud-caratula" colSpan={2}>
                  {data.caratulado || ""}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Est. Adm.:</strong> {data.estado_adm || "—"}
                </td>
                <td>
                  <strong>Proc.:</strong> {data.procedimiento || "—"}
                </td>
                <td colSpan={2}>
                  <strong>Ubicación:</strong> {data.ubicacion || "—"}
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Estado Proc.:</strong> <span className={`pjud-estado ${tono}`}>{data.estado_proc || "—"}</span>
                </td>
                <td>
                  <strong>Etapa:</strong> {data.etapa || "—"}
                </td>
                <td colSpan={2}>
                  <strong>Tribunal:</strong> {data.tribunal}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Litigantes */}
          <div className="pjud-seccion">Litigantes</div>
          <table className="pjud-tabla">
            <thead>
              <tr>
                <th>Participante</th>
                <th>Rut</th>
                <th>Persona</th>
                <th>Nombre o Razón Social</th>
              </tr>
            </thead>
            <tbody>
              {partes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="pjud-nada">
                    Sin litigantes publicados
                  </td>
                </tr>
              ) : (
                partes.map((p, i) => (
                  <tr key={i} className={tipoDe(p.tipo)}>
                    <td>
                      <span className="pjud-sujeto" title={ROTULO_PARTE[p.tipo] ?? p.sujeto}>
                        {p.sujeto}
                      </span>
                    </td>
                    <td className="pjud-num">{p.rut}</td>
                    <td>{p.persona}</td>
                    <td>{p.nombre}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Historia por cuaderno: pestañas si hay más de uno, de 10 en 10, folio más reciente arriba */}
          <PjudCuadernos cuadernos={data.cuadernos ?? []} />
        </>
      )}

      <div className="pjud-pie">
        <span>Datos extraídos del Poder Judicial de Chile · pjud.cl</span>
        <a href={enlace} target="_blank" rel="noopener noreferrer" className="pjud-link">
          Ver en PJUD <Icon name="external" size={12} />
        </a>
      </div>
    </section>
  );
}

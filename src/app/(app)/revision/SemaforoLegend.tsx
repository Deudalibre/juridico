import { SEMAFORO, SEMAFORO_KEYS, semaforoStyle } from "@/lib/legal";

/** Leyenda del semáforo, discreta, en la cabecera de la cola: la que el estudio tenía al pie de su Excel. */
export function SemaforoLegend() {
  return (
    <span className="sem-legend" aria-label="Leyenda de colores">
      {SEMAFORO_KEYS.map((k) => (
        <span key={k} title={SEMAFORO[k].hint}>
          <span className="sem-dot" style={semaforoStyle(k)} aria-hidden />
          {SEMAFORO[k].label}
        </span>
      ))}
    </span>
  );
}

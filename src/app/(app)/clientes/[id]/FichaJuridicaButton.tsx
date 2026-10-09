"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Modal } from "@/components/ui/Dialog";
import { fechaPjud, haceCuanto, type PjudCausaData } from "@/lib/pjud-data";
import { cargarPjud } from "../actions";
import { PjudDetalle } from "./PjudDetalle";
import { SincronizarPjud } from "./SincronizarPjud";

type Props = {
  /** Fila de pjud_causa_data ya cargada (cabecera de la ficha). Si se omite, se carga al abrir (fila de la lista). */
  data?: PjudCausaData | null;
  rol: string | null;
  tribunal: string | null;
  pjudUrl: string | null;
  clientId: string;
  canSync: boolean;
  /** «row»: enlace discreto al final de la fila de la lista; «icon»: botón redondo gris de Revisión; «menu»: elemento del menú «···» de la ficha; por defecto, botón de la cabecera. */
  variant?: "row" | "icon" | "menu";
  /** Se llama al abrir la ventana (el menú «···» se cierra) */
  onOpen?: () => void;
};

/**
 * «Ficha jurídica»: abre el espejo del modal «Detalle Causa Civil» del PJUD con los datos sincronizados. Es el único
 * lugar de la app donde vive la ficha del Poder Judicial (lista de clientes y cabecera de la causa). Igual que en la
 * OJV: título azul, «×», cabecera, cuaderno, pestañas y tablas.
 */
/**
 * Frescura de los datos, para que el operador vea de un vistazo si puede fiarse: verde hasta 24 h, ámbar hasta 3 días,
 * rojo si es más antiguo, si la última sincronización falló o si nunca se sincronizó. La fecha exacta va al pasar el ratón.
 */
function EstadoSync({ data, cargando }: { data: PjudCausaData | null; cargando: boolean }) {
  const [ahora] = useState(() => Date.now()); // fijado al abrir: la frescura no necesita correr en vivo
  const horas = data?.synced_at ? (ahora - Date.parse(data.synced_at)) / 3_600_000 : null;
  const fallo = !!data?.error && !!data.error_at && (!data.synced_at || Date.parse(data.error_at) > Date.parse(data.synced_at));
  const tono = cargando ? "espera" : horas == null ? "rojo" : fallo || horas > 72 ? "rojo" : horas > 24 ? "ambar" : "verde";
  const texto = cargando ? "Actualizando…" : horas == null ? "Sin sincronizar" : fallo ? `Falló la última sincronización · datos de ${haceCuanto(data!.synced_at, ahora)}` : horas > 72 ? `Desactualizado · ${haceCuanto(data!.synced_at, ahora)}` : `Actualizado ${haceCuanto(data!.synced_at, ahora)}`;
  const detalle = data?.synced_at ? `Última lectura del PJUD: ${new Date(data.synced_at).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" })}. Se sincroniza a diario a las 12:00 desde el estudio.` : "Todavía no se ha leído esta causa en el PJUD.";
  return (
    <span className="ojv-sync" title={fallo && data?.error ? `${detalle} Error: ${data.error}` : detalle}>
      <span className="ojv-sync-fuente">
        <Icon name="court" size={13} />
        Datos extraídos del Poder Judicial de Chile · pjud.cl
      </span>
      <span className={`ojv-sync-pill ${tono}`}>
        <span className="ojv-sync-dot" aria-hidden />
        {texto}
      </span>
    </span>
  );
}

export function FichaJuridicaButton({ data: inicial, rol, tribunal, clientId, canSync, variant, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [cargada, setCargada] = useState<PjudCausaData | null | undefined>(inicial);
  const [cargando, start] = useTransition();
  const sinRol = !rol || !tribunal;
  const bajoDemanda = inicial === undefined;
  // En la cabecera los datos llegan del servidor y se refrescan con router.refresh(); en la lista se piden al abrir.
  const data = bajoDemanda ? cargada : inicial;

  const recargar = () => start(async () => setCargada((await cargarPjud(clientId)).data));
  const abrir = () => {
    onOpen?.();
    setOpen(true);
    if (bajoDemanda) recargar();
  };
  const cerrar = () => setOpen(false);

  return (
    <>
      {variant === "row" ? (
        <button type="button" className="row-view" title="Detalle de la causa como en el Poder Judicial" onClick={abrir}>
          <Icon name="court" size={13} /> Ficha jurídica
        </button>
      ) : variant === "menu" ? (
        <button type="button" className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-fg hover:bg-surface-2" role="menuitem" title="Detalle de la causa como en el Poder Judicial" onClick={abrir}>
          <Icon name="court" size={14} /> Ficha jurídica PJUD
        </button>
      ) : variant === "icon" ? (
        <button type="button" className="icon-btn contact pjud" title="Ficha jurídica: detalle de la causa como en el Poder Judicial" aria-label="Ficha jurídica" onClick={abrir}>
          <Icon name="court" size={14} />
        </button>
      ) : (
        <button type="button" className="btn-outline btn-sm" onClick={abrir} title="Detalle de la causa como en el Poder Judicial">
          <Icon name="court" size={14} /> Ficha jurídica
        </button>
      )}
      {open && (
        <Modal title="Detalle Causa Civil" onClose={cerrar} size="xl" hideTitle>
          <div className="ojv-modal">
            <div className="ojv-modal-head">
              <span className="ojv-modal-titulo">Detalle Causa Civil</span>
              <button type="button" className="ojv-modal-cerrar" onClick={cerrar} aria-label="Cerrar">
                ×
              </button>
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
            ) : bajoDemanda && cargada === undefined ? (
              <div className="pjud-vacio">Cargando la causa…</div>
            ) : !data?.synced_at ? (
              <div className="pjud-vacio">Todavía no hay datos del Poder Judicial para {rol} · {tribunal}. Se sincroniza a diario a las 12:00 desde el estudio.</div>
            ) : (
              <PjudDetalle data={data} />
            )}
            <div className="ojv-modal-pie">
              <EstadoSync data={data ?? null} cargando={cargando} />
              <span className="flex items-center gap-2">
                {canSync && !sinRol && <SincronizarPjud clientId={clientId} syncedAt={data?.synced_at ?? null} onDone={bajoDemanda ? recargar : undefined} />}
                <button type="button" className="btn-primary btn-sm" onClick={cerrar}>
                  Cerrar
                </button>
              </span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

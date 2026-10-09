"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import type { PjudCausaData } from "@/lib/pjud-data";
import { CloseCase } from "./CloseCase";
import { FichaJuridicaButton } from "./FichaJuridicaButton";

type Props = {
  clientId: string;
  closed: boolean;
  closeReason: string | null;
  closeDetail: string | null;
  canEdit: boolean;
  driveUrl: string | null;
  pjud: PjudCausaData | null;
  rol: string | null;
  tribunal: string | null;
  pjudUrl: string | null;
  /** Expediente LVS: solo liquidaciones con documents.view */
  lvs: boolean;
};

/** Un elemento del menú «···»: mismo aspecto para enlaces y botones. */
export const MENU_ITEM = "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-fg hover:bg-surface-2 disabled:opacity-50";

/**
 * Acciones de la cabecera de la ficha, aligeradas: un botón principal según el contexto (la carpeta del Drive si está
 * vinculada; si no, la Ficha jurídica del PJUD; si no, el Expediente LVS) y un menú «···» con todo lo demás (carpeta,
 * ficha jurídica, expediente, cerrar o reabrir la causa). Menú sin librerías: un panel .popover que se cierra al elegir,
 * al hacer clic fuera o con Escape (mismo patrón que HelpPop).
 */
export function FichaAcciones({ clientId, closed, closeReason, closeDetail, canEdit, driveUrl, pjud, rol, tribunal, pjudUrl, lvs }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [open]);

  const tieneCausa = !!rol && !!tribunal;
  const ficha = (variant: "menu" | undefined, onOpen?: () => void) => <FichaJuridicaButton data={pjud} rol={rol} tribunal={tribunal} pjudUrl={pjudUrl} clientId={clientId} canSync={canEdit} variant={variant} onOpen={onOpen} />;
  const expediente = (clase: string, children: ReactNode) => (
    <Link href={`/documentos/lvs/${clientId}`} className={clase} title="Ficha Maestra, bienes, acreedores y documentos de la solicitud LVS" onClick={() => setOpen(false)}>
      {children}
    </Link>
  );

  // Botón principal: lo más útil que exista para esta causa
  const principal = driveUrl ? (
    <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">
      <Icon name="folder" size={14} /> Carpeta
    </a>
  ) : tieneCausa ? (
    ficha(undefined)
  ) : lvs ? (
    expediente("btn-outline btn-sm", <><Icon name="report" size={13} /> Expediente LVS</>)
  ) : null;

  return (
    <div className="flex items-center gap-2">
      {principal}
      <div ref={ref} className="relative z-20">
        <button type="button" className="btn-outline btn-sm !px-2.5" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Más acciones" title="Más acciones">
          <span className="text-[16px] leading-none tracking-[0.1em]">···</span>
        </button>
        {open && (
          <div className="popover fade-in !w-60 right-0 flex flex-col py-1.5" role="menu">
            {driveUrl ? (
              <a href={driveUrl} target="_blank" rel="noopener noreferrer" className={MENU_ITEM} role="menuitem" onClick={() => setOpen(false)}>
                <Icon name="folder" size={14} /> Carpeta del cliente
              </a>
            ) : (
              <Link href="?tab=Antecedentes#enlaces" className={`${MENU_ITEM} text-muted`} role="menuitem" title="Aún sin enlace: agrégalo en «Enlaces»" onClick={() => setOpen(false)}>
                <Icon name="folder" size={14} /> Carpeta del cliente <span className="ml-auto text-[11px] text-faint">sin enlace</span>
              </Link>
            )}
            {ficha("menu", () => setOpen(false))}
            {lvs && expediente(MENU_ITEM, <><Icon name="report" size={14} /> Expediente LVS</>)}
            {canEdit && (
              <>
                <div className="my-1 h-px bg-line-soft" aria-hidden />
                <CloseCase clientId={clientId} closed={closed} reason={closeReason} detail={closeDetail} canEdit={canEdit} variant="menu" onOpen={() => setOpen(false)} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { Icon } from "@/components/icons";
import { phoneLinks } from "@/lib/phone";

type Props = {
  phone: string | null | undefined;
  /** Nombre del cliente, para el título del botón y el mensaje de WhatsApp. */
  name: string;
  /** «icon»: dos botones cuadrados para las filas; «labeled»: con texto, para la ficha. */
  variant?: "icon" | "labeled";
};

/**
 * WhatsApp y llamada al cliente, en la fila y en la ficha: hay diligencias en que el abogado tiene que contactarlo
 * (pedido del estudio, 2026-10-06). Sin teléfono no se muestran: la ficha ya avisa «Falta: contacto».
 * No pasa por ninguna acción del servidor: son enlaces wa.me y tel: que abre el navegador.
 */
export function ContactButtons({ phone, name, variant = "icon" }: Props) {
  const links = phoneLinks(phone);
  if (!links) return null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const first = name.split(" ")[0];
  const wa = links.wa ? `${links.wa}?text=${encodeURIComponent(`Hola ${first}, le escribo de Deuda Libre por su causa.`)}` : null;
  if (variant === "labeled")
    return (
      <span className="flex flex-wrap gap-1.5">
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm contact-wa" title={`WhatsApp a ${links.e164}`}>
            <Icon name="whatsapp" size={13} /> WhatsApp
          </a>
        )}
        <a href={links.tel} className="btn-secondary btn-sm contact-tel" title={`Llamar al ${links.e164 ?? phone}`}>
          <Icon name="phone" size={13} /> Llamar
        </a>
      </span>
    );
  return (
    <>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="icon-btn contact wa" title={`WhatsApp · ${links.e164}`} aria-label={`WhatsApp a ${name}`} onClick={stop}>
          <Icon name="whatsapp" size={14} />
        </a>
      )}
      <a href={links.tel} className="icon-btn contact tel" title={`Llamar · ${links.e164 ?? phone}`} aria-label={`Llamar a ${name}`} onClick={stop}>
        <Icon name="phone" size={14} />
      </a>
    </>
  );
}

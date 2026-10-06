/**
 * Teléfonos de los clientes, tal como los guarda la importación («+56 9 3130 3946») o como los escribe el abogado.
 * De ahí salen los enlaces de llamada (tel:) y de WhatsApp (wa.me), que necesitan el número en formato internacional
 * sin espacios. Celulares chilenos: 9 dígitos que empiezan por 9, con o sin el 56 delante.
 */
export function phoneLinks(phone: string | null | undefined): { tel: string; wa: string | null; e164: string | null } | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return null;
  let e164: string | null = null;
  if (/^569\d{8}$/.test(digits)) e164 = `+${digits}`;
  else if (/^9\d{8}$/.test(digits)) e164 = `+56${digits}`;
  else if (/^56\d{9}$/.test(digits)) e164 = `+${digits}`;
  else if (/^\d{9}$/.test(digits)) e164 = `+56${digits}`;
  // WhatsApp solo con celular; la llamada sirve con cualquier número
  const wa = e164 && /^\+569\d{8}$/.test(e164) ? `https://wa.me/${e164.slice(1)}` : null;
  return { tel: `tel:${e164 ?? digits}`, wa, e164 };
}

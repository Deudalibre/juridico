// RUT chileno: control FORMAL (formato y dígito verificador). No verifica identidad.

/** Deja solo dígitos y K, en mayúscula: «12.345.678-5» → «123456785». */
export const cleanRut = (rut: string) => rut.replace(/[^0-9kK]/g, "").toUpperCase();

/** Dígito verificador (módulo 11) del cuerpo numérico. */
function rutDv(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}

export function isValidRut(rut: string): boolean {
  const c = cleanRut(rut);
  if (c.length < 7 || c.length > 9) return false;
  const body = c.slice(0, -1);
  if (!/^\d+$/.test(body)) return false;
  return rutDv(body) === c.slice(-1);
}

/** «123456785» → «12.345.678-5» (formato habitual en documentos). */
export function formatRut(rut: string | null): string {
  if (!rut) return "";
  const c = cleanRut(rut);
  if (c.length < 2) return c;
  const body = c.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${c.slice(-1)}`;
}

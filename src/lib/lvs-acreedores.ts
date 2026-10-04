// Acreedores y deudas de la LVS (Anexo 9). Sin dependencias de servidor.

export type Acreedor = {
  id: string;
  nombre: string;
  rut: string | null;
  alias: string[];
  domicilio: string | null;
  representante: string | null;
  rut_representante: string | null;
  email: string | null;
  telefono: string | null;
  naturaleza: string | null;
  origen: "importado" | "manual";
  activo: boolean;
};

/** Lo que viaja al buscador: lo justo para encontrar y rellenar. */
export type AcreedorLite = Pick<Acreedor, "id" | "nombre" | "rut" | "alias" | "email" | "telefono" | "naturaleza">;

export type Deuda = {
  id: string;
  client_id: string;
  acreedor_id: string | null;
  nombre: string;
  rut: string | null;
  email: string | null;
  telefono: string | null;
  monto: number | null;
  naturaleza: NaturalezaDeuda;
  origen_credito: string | null;
  cmf: boolean;
  calidad: CalidadDeuda;
  observaciones: string | null;
  orden: number;
};

export const NATURALEZAS = ["Valista", "Preferente", "Privilegiado"] as const;
export type NaturalezaDeuda = (typeof NATURALEZAS)[number];
export const CALIDADES = ["Deudor principal", "Fiador", "Codeudor", "Aval"] as const;
export type CalidadDeuda = (typeof CALIDADES)[number];

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soloRut = (s: string) => s.replace(/[^0-9kK]/g, "").toUpperCase();

/**
 * Busca en el catálogo por nombre (cualquier palabra, sin tildes), alias o RUT (con o sin puntos).
 * «falabella» encuentra Banco Falabella, Promotora CMR Falabella y Soluciones Crediticias CMR Falabella.
 */
export function buscarAcreedores(catalogo: AcreedorLite[], q: string, max = 8): AcreedorLite[] {
  const t = plain(q.trim());
  if (!t) return [];
  const rutQ = soloRut(q);
  const porRut = rutQ.length >= 4 && /^[0-9]+[0-9K]$/.test(rutQ);
  const palabras = t.split(/\s+/).filter(Boolean);
  const puntaje = (a: AcreedorLite) => {
    if (porRut && a.rut && soloRut(a.rut).startsWith(rutQ)) return 100;
    const nombres = [a.nombre, ...a.alias].map(plain);
    let best = 0;
    for (const n of nombres) {
      if (n === t) best = Math.max(best, 90);
      else if (n.startsWith(t)) best = Math.max(best, 80);
      else if (palabras.every((p) => n.includes(p))) best = Math.max(best, 60 - n.length / 100);
    }
    return best;
  };
  return catalogo
    .map((a) => ({ a, s: puntaje(a) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s || x.a.nombre.localeCompare(y.a.nombre))
    .slice(0, max)
    .map((x) => x.a);
}

export const totalDeudas = (deudas: Deuda[]) => deudas.reduce((n, d) => n + (d.monto ?? 0), 0);

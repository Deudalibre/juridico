"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { PROCEDURES } from "@/lib/legal";

/** Filtros de la revisión: año de ingreso (una «hoja» del Excel), de quién son las causas y procedimiento. */
export function Filters({ view, proc, anio, years, lawyers }: { view: string; proc: string; anio: string; years: string[]; lawyers: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (v: string, p: string, y: string) => {
    const q = new URLSearchParams();
    if (y) q.set("anio", y);
    if (v !== "equipo") q.set("ver", v);
    if (p) q.set("proc", p);
    const s = q.toString();
    router.push(s ? `/revision?${s}` : "/revision");
  };
  return (
    <>
      <Select
        prefix="Año:"
        ariaLabel="Año de ingreso"
        value={anio}
        options={[{ key: "", label: "Todos" }, ...years.map((y) => ({ key: y, label: y })), { key: "sin", label: "Sin fecha" }]}
        onChange={(y) => go(view, proc, y)}
      />
      <Select
        ariaLabel="Causas de"
        value={view}
        options={[{ key: "equipo", label: "Todo el equipo" }, { key: "mios", label: "Mis causas" }, ...lawyers.map((m) => ({ key: m.id, label: m.name }))]}
        onChange={(v) => go(v, proc, anio)}
      />
      <Select ariaLabel="Procedimiento" value={proc} options={[{ key: "", label: "Todos los procedimientos" }, ...PROCEDURES.map((p) => ({ key: p, label: p }))]} onChange={(p) => go(view, p, anio)} />
    </>
  );
}

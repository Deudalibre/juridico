"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { PROCEDURES } from "@/lib/legal";

/** Filtros de la revisión: de quién son las causas y procedimiento (el año y el mes se eligen con «Revisar»). */
export function Filters({ view, proc, anio, mes, lawyers }: { view: string; proc: string; anio: string; mes: number; lawyers: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (v: string, p: string) => {
    const q = new URLSearchParams();
    if (anio) q.set("anio", anio);
    if (mes) q.set("mes", String(mes));
    if (v !== "equipo") q.set("ver", v);
    if (p) q.set("proc", p);
    const s = q.toString();
    router.push(s ? `/revision?${s}` : "/revision");
  };
  return (
    <>
      <Select
        ariaLabel="Causas de"
        value={view}
        options={[{ key: "equipo", label: "Todo el equipo" }, { key: "mios", label: "Mis causas" }, ...lawyers.map((m) => ({ key: m.id, label: m.name }))]}
        onChange={(v) => go(v, proc)}
        size="sm"
      />
      <Select ariaLabel="Procedimiento" value={proc} options={[{ key: "", label: "Todos los procedimientos" }, ...PROCEDURES.map((p) => ({ key: p, label: p }))]} onChange={(p) => go(view, p)} size="sm" />
    </>
  );
}

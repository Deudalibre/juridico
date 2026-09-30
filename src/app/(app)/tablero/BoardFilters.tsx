"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { PROCEDURES } from "@/lib/legal";

/** Filtros del tablero: procedimiento (una columna por paso) y de quién son las causas. */
export function BoardFilters({ proc, view, lawyers }: { proc: string; view: string; lawyers: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (p: string, v: string) => {
    const q = new URLSearchParams();
    if (p !== PROCEDURES[0]) q.set("proc", p);
    if (v !== "equipo") q.set("ver", v);
    const s = q.toString();
    router.push(s ? `/tablero?${s}` : "/tablero");
  };
  return (
    <>
      <Select prefix="Procedimiento:" ariaLabel="Procedimiento" value={proc} options={PROCEDURES.map((p) => ({ key: p, label: p }))} onChange={(p) => go(p, view)} size="sm" />
      <Select
        prefix="Causas de:"
        ariaLabel="Causas de"
        value={view}
        options={[{ key: "equipo", label: "Todo el equipo" }, { key: "mios", label: "Mis causas" }, ...lawyers.map((m) => ({ key: m.id, label: m.name }))]}
        onChange={(v) => go(proc, v)}
        size="sm"
      />
    </>
  );
}

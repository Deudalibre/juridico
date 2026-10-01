"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

/** Filtros de la supervisión de tareas: quién cerró y en qué fechas. */
export function TasksFilters({ quien, desde, hasta, q, lawyers }: { quien: string; desde: string; hasta: string; q: string; lawyers: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (patch: Partial<{ quien: string; desde: string; hasta: string }>) => {
    const v = { quien, desde, hasta, q, ...patch };
    const p = new URLSearchParams();
    Object.entries(v).forEach(([k, val]) => val && p.set(k, val));
    const s = p.toString();
    router.push(s ? `/revision/tareas?${s}` : "/revision/tareas");
  };
  return (
    <>
      <Select ariaLabel="Quién cerró" value={quien} options={[{ key: "", label: "Todo el equipo" }, ...lawyers.map((m) => ({ key: m.id, label: m.name }))]} onChange={(v) => go({ quien: v })} />
      <input type="date" className="input !min-h-[36px] w-[150px] tabnum" value={desde} onChange={(e) => go({ desde: e.target.value })} aria-label="Desde" />
      <input type="date" className="input !min-h-[36px] w-[150px] tabnum" value={hasta} onChange={(e) => go({ hasta: e.target.value })} aria-label="Hasta" />
    </>
  );
}

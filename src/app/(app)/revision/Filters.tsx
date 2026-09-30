"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { PROCEDURES } from "@/lib/legal";

/** Filtros de la revisión: de quién son las causas y de qué procedimiento (mismo selector que el CRM). */
export function Filters({ view, proc, lawyers }: { view: string; proc: string; lawyers: { id: string; name: string }[] }) {
  const router = useRouter();
  const go = (v: string, p: string) => {
    const q = new URLSearchParams();
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
      />
      <Select ariaLabel="Procedimiento" value={proc} options={[{ key: "", label: "Todos los procedimientos" }, ...PROCEDURES.map((p) => ({ key: p, label: p }))]} onChange={(p) => go(view, p)} />
    </>
  );
}

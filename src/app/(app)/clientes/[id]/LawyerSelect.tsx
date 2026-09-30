"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { assignLawyer } from "../actions";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui";

type Member = { id: string; full_name: string; email: string; role: string; active: boolean };

/** Abogado a cargo: solo quien tiene legal.assign puede cambiarlo; el resto ve el nombre. Mismo selector que «Ejecutivo» en el CRM. */
export function LawyerSelect({ clientId, lawyerId, members, canAssign, compact }: { clientId: string; lawyerId: string | null; members: Member[]; canAssign: boolean; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const lawyers = members.filter((m) => m.active && (m.role === "juridico" || m.role === "administrador"));
  const current = members.find((m) => m.id === lawyerId);

  if (!canAssign)
    return current ? (
      <span className={`text-[13.5px] ${compact ? "" : "font-medium"}`}>{current.full_name || current.email}</span>
    ) : (
      <span className="tag warn">Sin abogado</span>
    );

  const options = [{ key: "", label: compact ? "Asignar a…" : "Sin abogado a cargo" }, ...lawyers.map((m) => ({ key: m.id, label: m.full_name || m.email }))];
  return (
    <Select
      value={lawyerId ?? ""}
      options={options}
      disabled={pending}
      ariaLabel="Abogado a cargo"
      size={compact ? "sm" : "md"}
      onChange={(value) => {
        const v = value || null;
        if (v === (lawyerId ?? null)) return;
        const name = lawyers.find((m) => m.id === v)?.full_name;
        start(async () => {
          const r = await assignLawyer(clientId, v);
          if (r.error) toast(r.error, true);
          else {
            toast(v ? `Asignado a ${name}` : "Sin abogado a cargo");
            router.refresh();
          }
        });
      }}
    />
  );
}

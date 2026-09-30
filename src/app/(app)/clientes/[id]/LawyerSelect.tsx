"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { assignLawyer } from "../actions";
import { toast } from "@/components/ui";

type Member = { id: string; full_name: string; email: string; role: string; active: boolean };

/** Abogado a cargo: solo quien tiene legal.assign puede cambiarlo; el resto ve el nombre. */
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

  return (
    <select
      className={`input ${compact ? "!min-h-[30px] !py-0 text-[12.5px]" : ""}`}
      value={lawyerId ?? ""}
      disabled={pending}
      aria-label="Abogado a cargo"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value || null;
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
    >
      <option value="">{compact ? "Asignar a…" : "Sin abogado a cargo"}</option>
      {lawyers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.full_name || m.email}
        </option>
      ))}
    </select>
  );
}

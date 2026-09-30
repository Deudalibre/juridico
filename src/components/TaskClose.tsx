"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { finishTask } from "@/app/(app)/clientes/actions";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CANCEL_REASONS, TASK_QUICK_RESULTS } from "@/lib/legal";
import type { LegalTask } from "@/lib/data";

type Props = {
  task: LegalTask;
  clientId: string;
  /** «popover»: el recuadro flota bajo los botones (filas apretadas). «inline»: ocupa el ancho del contenedor. */
  mode?: "inline" | "popover";
  onDone?: () => void;
};

/**
 * Cerrar una tarea en un solo gesto pero con registro: al pulsar «Completar» o «Cancelar» se pide el resultado
 * (obligatorio, corto) con respuestas frecuentes según el tipo de tarea. Queda quién, cuándo y qué resultado,
 * en la tarea y en el historial de la causa.
 */
export function TaskClose({ task, clientId, mode = "inline", onDone }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"completada" | "cancelada" | null>(null);
  const [result, setResult] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status) inputRef.current?.focus();
  }, [status]);

  // Popover: se cierra al hacer clic fuera o con Escape
  useEffect(() => {
    if (!status || mode !== "popover") return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setStatus(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setStatus(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [status, mode]);

  const quick = status === "cancelada" ? CANCEL_REASONS : TASK_QUICK_RESULTS[task.kind] ?? TASK_QUICK_RESULTS.otra;

  const save = (value = result) => {
    const text = value.trim();
    if (!status) return;
    if (text.length < 3) return toast(status === "completada" ? "Anota el resultado en pocas palabras." : "Indica por qué se cancela.", true);
    start(async () => {
      const r = await finishTask(task.id, clientId, status, text);
      if (r.error) toast(r.error, true);
      else {
        toast(status === "completada" ? "Tarea completada" : "Tarea cancelada");
        setStatus(null);
        setResult("");
        onDone?.();
        router.refresh();
      }
    });
  };

  const panel = status && (
    <div
      ref={boxRef}
      className={`card flex flex-col gap-2 p-3 text-left ${mode === "popover" ? "absolute right-0 top-full z-30 mt-1 w-[340px] shadow-lg" : "w-full"}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-label={status === "completada" ? "Resultado de la tarea" : "Motivo de la cancelación"}
    >
      <span className="text-[12.5px] font-semibold text-fg">{status === "completada" ? "¿Qué resultado tuvo?" : "¿Por qué se cancela?"}</span>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button key={q} type="button" className={`row-chip ${result === q ? "brand" : ""}`} disabled={pending} onClick={() => save(q)} title="Guardar con esta respuesta">
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input ref={inputRef} className="input !min-h-[32px] flex-1 text-[12.5px]" value={result} onChange={(e) => setResult(e.target.value)} maxLength={300} placeholder="O escribe el resultado…" disabled={pending} />
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setStatus(null)} disabled={pending}>
          Volver
        </button>
      </form>
      <span className="text-[11.5px] text-muted">Queda con tu nombre, día y hora en el historial de la causa.</span>
    </div>
  );

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${mode === "popover" ? "relative" : ""}`}>
      {!status && (
        <>
          <button className={mode === "popover" ? "btn-ghost btn-sm" : "btn-outline btn-sm"} disabled={pending} onClick={() => setStatus("completada")} title="Marcar la tarea como completada">
            <Icon name="check" size={13} /> Completar
          </button>
          {mode === "inline" && (
            <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setStatus("cancelada")}>
              Cancelar
            </button>
          )}
        </>
      )}
      {panel}
    </div>
  );
}

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
  /** «inline»: botones y recuadro apilados. «row»: los botones van en su sitio y el recuadro ocupa todo el ancho de la fila (flex-wrap). */
  layout?: "inline" | "row";
  /** Si se muestra «Cancelar» además de «Completar». */
  allowCancel?: boolean;
  onDone?: () => void;
};

/**
 * Cerrar una tarea en un solo gesto pero con registro: al pulsar «Completar» o «Cancelar» se pide el resultado
 * (obligatorio, corto) con respuestas frecuentes según el tipo de tarea. Queda quién, cuándo y qué resultado,
 * en la tarea y en el historial de la causa.
 */
export function TaskClose({ task, clientId, layout = "inline", allowCancel = true, onDone }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<"completada" | "cancelada" | null>(null);
  const [result, setResult] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status) inputRef.current?.focus();
  }, [status]);

  const quick = status === "cancelada" ? CANCEL_REASONS : TASK_QUICK_RESULTS[task.kind] ?? TASK_QUICK_RESULTS.otra;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

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

  const buttons = !status && (
    <>
      <button className="btn-outline btn-sm" disabled={pending} onClick={(e) => (stop(e), setStatus("completada"))} title="Marcar la tarea como completada">
        <Icon name="check" size={13} /> Completar
      </button>
      {allowCancel && (
        <button className="btn-ghost btn-sm" disabled={pending} onClick={(e) => (stop(e), setStatus("cancelada"))}>
          Cancelar
        </button>
      )}
    </>
  );

  const panel = status && (
    <div
      className={`card flex flex-col gap-2 p-3 text-left ${layout === "row" ? "order-last basis-full" : "w-full"}`}
      onClick={stop}
      onKeyDown={stop}
      role="group"
      aria-label={status === "completada" ? "Resultado de la tarea" : "Motivo de la cancelación"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-fg">
          {status === "completada" ? "Completar" : "Cancelar"} «{task.title}» · {status === "completada" ? "¿qué resultado tuvo?" : "¿por qué?"}
        </span>
        <span className="text-[11.5px] text-muted">Queda con tu nombre, día y hora en el historial.</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((q) => (
          <button key={q} type="button" className="row-chip" disabled={pending} onClick={() => save(q)} title="Guardar con esta respuesta">
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
        <input ref={inputRef} className="input !min-h-[32px] flex-1 text-[12.5px]" value={result} onChange={(e) => setResult(e.target.value)} maxLength={300} placeholder="O escribe el resultado y pulsa Enter…" disabled={pending} />
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "…" : "Guardar"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setStatus(null)} disabled={pending}>
          Volver
        </button>
      </form>
    </div>
  );

  // «row»: el contenedor desaparece (display: contents) para que botones y recuadro sean hijos directos de la fila
  return (
    <div className={layout === "row" ? "contents" : "flex flex-wrap items-center gap-1.5"} onClick={stop}>
      {buttons}
      {panel}
    </div>
  );
}

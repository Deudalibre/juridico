"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { revealClaveUnica, setClaveUnica } from "../actions";
import { toast } from "@/components/ui";

const VISIBLE_SECONDS = 20;

/**
 * Clave Única del cliente. Vive cifrada en la bóveda de Supabase: aquí nunca se guarda en el
 * navegador más allá de los segundos en que se muestra, y cada vista queda en la auditoría.
 */
export function ClaveUnica({ clientId, has, canEdit }: { clientId: string; has: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "edit" | "confirm-remove">("idle");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (value === null) return;
    const t = setTimeout(() => setValue(null), VISIBLE_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [value]);

  const reveal = () =>
    start(async () => {
      const r = await revealClaveUnica(clientId);
      if (r.error) toast(r.error, true);
      else setValue(r.value ?? "");
    });

  const save = () =>
    start(async () => {
      const r = await setClaveUnica(clientId, draft);
      if (r.error) toast(r.error, true);
      else {
        toast(draft.trim() ? "Clave Única guardada" : "Clave Única quitada");
        setDraft("");
        setValue(null);
        setMode("idle");
        router.refresh();
      }
    });

  const copy = async () => {
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      toast("Copiada al portapapeles");
    } catch {
      toast("No se pudo copiar", true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {mode === "edit" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            className="input tabnum min-w-[160px] flex-1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={has ? "Nueva Clave Única" : "Clave Única"}
            autoComplete="new-password"
            maxLength={64}
            disabled={pending}
            aria-label="Clave Única"
          />
          <button className="btn-primary btn-sm" onClick={save} disabled={pending || !draft.trim()}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setMode("idle")} disabled={pending}>
            Cancelar
          </button>
        </div>
      ) : !has ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] text-faint">No registrada</span>
          {canEdit && (
            <button className="btn-outline btn-sm" onClick={() => setMode("edit")}>
              Registrar
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {value !== null ? (
            <>
              <span className="tabnum rounded-md bg-surface-2 px-2 py-1 font-mono text-[13.5px] font-medium">{value || "—"}</span>
              <button className="btn-outline btn-sm" onClick={copy}>
                Copiar
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setValue(null)}>
                Ocultar
              </button>
            </>
          ) : (
            <>
              <span className="tabnum text-[13.5px] font-medium tracking-[0.2em]">••••••••</span>
              <button className="btn-outline btn-sm" onClick={reveal} disabled={pending}>
                {pending ? "…" : "Mostrar"}
              </button>
            </>
          )}
          {canEdit && mode === "idle" && (
            <>
              <button className="btn-ghost btn-sm" onClick={() => setMode("edit")}>
                Cambiar
              </button>
              <button className="btn-ghost btn-sm text-danger" onClick={() => setMode("confirm-remove")}>
                Quitar
              </button>
            </>
          )}
          {mode === "confirm-remove" && (
            <>
              <button
                className="btn-danger btn-sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setClaveUnica(clientId, "");
                    if (r.error) toast(r.error, true);
                    else {
                      toast("Clave Única quitada");
                      setMode("idle");
                      router.refresh();
                    }
                  })
                }
              >
                Confirmar quitar
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setMode("idle")}>
                Cancelar
              </button>
            </>
          )}
        </div>
      )}
      <span className="text-[11.5px] text-faint">
        Cifrada en la bóveda. Se muestra {VISIBLE_SECONDS} segundos y cada vista queda registrada con tu nombre y la hora.
      </span>
    </div>
  );
}

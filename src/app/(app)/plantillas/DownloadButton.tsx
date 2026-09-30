"use client";

import { useTransition } from "react";
import { toast } from "@/components/ui";
import { Icon } from "@/components/icons";
import { templateUrl } from "./actions";

/** Descarga el Word marcado (enlace firmado de 2 minutos). */
export function DownloadButton({ id, className = "btn-outline btn-sm" }: { id: string; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await templateUrl(id);
          if (r.error || !r.url) toast(r.error ?? "Sin enlace", true);
          else window.open(r.url, "_blank", "noopener");
        })
      }
    >
      <Icon name="download" size={14} /> {pending ? "Preparando…" : "Descargar"}
    </button>
  );
}

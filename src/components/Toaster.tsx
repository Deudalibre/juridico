"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Toast = { message: string; error?: boolean };

/** Muestra toasts lanzados con toast() o llegados como ?toast= tras un redirect de una server action. */
export function Toaster() {
  const [current, setCurrent] = useState<(Toast & { key: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();

  const show = (t: Toast) => {
    // key nueva → el toast se vuelve a montar y repite la animación de entrada
    setCurrent({ ...t, key: Date.now() });
    setLeaving(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLeaving(true);
      timer.current = setTimeout(() => setCurrent(null), 180);
    }, 3200);
  };

  useEffect(() => {
    const onToast = (e: Event) => show((e as CustomEvent<Toast>).detail);
    window.addEventListener("crm:toast", onToast);
    return () => {
      window.removeEventListener("crm:toast", onToast);
      clearTimeout(timer.current);
    };
  }, []);

  const fromUrl = params.get("toast");
  useEffect(() => {
    if (!fromUrl) return;
    show({ message: fromUrl, error: fromUrl.startsWith("No se pudo") });
    const rest = new URLSearchParams(params.toString());
    rest.delete("toast");
    router.replace(rest.size ? `${path}?${rest}` : path, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromUrl]);

  if (!current) return null;
  return (
    <div key={current.key} className={`toast ${current.error ? "error" : ""} ${leaving ? "leaving" : ""}`} role="status">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current.error ? "var(--danger)" : "var(--brand-primary)" }} />
      {current.message}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

type Notice = { id: string; client_id: string | null; title: string; body: string | null; read_at: string | null; created_at: string };

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/** Avisos del área jurídica: tareas asignadas o pendientes tras una revisión (misma tabla que el CRM). */
export function Notifications({ userId }: { userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("notifications")
      .select("id, client_id, title, body, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notice[]);
  }, []);

  useEffect(() => {
    // Primera carga fuera del cuerpo del efecto (la suscripción de abajo trae las siguientes)
    queueMicrotask(load);
    const supabase = createClient();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => load());
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, userId]);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const unread = (items ?? []).filter((n) => !n.read_at).length;

  const markAll = async () => {
    const ids = (items ?? []).filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  };

  const openItem = async (n: Notice) => {
    if (!n.read_at) await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
    setOpen(false);
    load();
    if (n.client_id) router.push(`/clientes/${n.client_id}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button className="topbar-btn" onClick={() => setOpen(!open)} aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ""}`} aria-expanded={open}>
        <Icon name="bell" size={15} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="popover fade-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[13px] font-semibold">Notificaciones</span>
            {unread > 0 && (
              <button className="border-0 bg-transparent text-xs font-medium text-accent hover:underline" onClick={markAll}>
                Marcar todas como leídas
              </button>
            )}
          </div>
          <div className="max-h-[360px] overflow-y-auto">
            {items === null ? (
              <div className="flex flex-col gap-2 p-4">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted">Sin notificaciones. Aquí verás las tareas que te asignen y las causas que queden pendientes tras una revisión.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className="flex w-full gap-3 border-0 border-b border-line-soft bg-transparent px-4 py-3 text-left hover:bg-surface-2"
                  style={{ background: n.read_at ? undefined : "var(--surface-active)" }}
                >
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: n.read_at ? "transparent" : "var(--brand-primary)" }} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-medium text-fg">{n.title}</span>
                    {n.body && <span className="text-xs text-muted">{n.body}</span>}
                    <span className="text-[11px] text-faint">{ago(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

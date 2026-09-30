"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["legal_clients", "legal_tasks", "legal_reviews", "legal_case_steps"];

/**
 * Escucha cambios en Supabase Realtime y vuelve a renderizar los Server
 * Components, así Revisión, la lista de causas y la ficha se actualizan solos
 * (también con cambios hechos desde otra pestaña o dispositivo).
 */
export function Realtime({ userId }: { userId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 250);
    };

    const channel = supabase.channel(`juridico-${userId}`);
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }

    let cancelled = false;
    // Realtime aplica RLS con el JWT del usuario: hay que pasárselo antes de suscribirse.
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel.subscribe();
    });

    return () => {
      cancelled = true;
      clearTimeout(pending);
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  return null;
}

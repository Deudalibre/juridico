import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { sessionCookieOptions } from "./cookies";
import { redirect } from "next/navigation";

export async function createClient() {
  const cookieStore = await cookies();
  const host = (await headers()).get("host");
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: sessionCookieOptions(host),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: el middleware ya refresca la sesión.
        }
      },
    },
  });
}

/** Lo que la app necesita del usuario autenticado; sale del JWT verificado, no de una consulta al servidor de Auth. */
export type SessionUser = { id: string; email: string | null; user_metadata: Record<string, unknown> };

/** Cliente + usuario autenticado; sin sesión, al login del CRM (Jurídico no tiene login propio). */
export async function requireUser(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; user: SessionUser }> {
  const supabase = await createClient();
  // getClaims verifica la firma del JWT localmente (el proyecto usa claves asimétricas ES256; el JWKS se cachea en memoria):
  // antes, getUser() pedía el usuario al servidor de Auth en cada petición, un viaje de red extra por pantalla.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect(`${process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000"}/login`);
  const user: SessionUser = {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    user_metadata: (claims.user_metadata ?? {}) as Record<string, unknown>,
  };
  return { supabase, user };
}

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieOptions } from "./cookies";

// Jurídico no tiene login propio: sin sesión se manda al login del CRM con el destino en ?next=
const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL ?? "http://localhost:3000";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: sessionCookieOptions(request.headers.get("host")),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    }
  );

  // Verifica la firma del JWT localmente (claves asimétricas del proyecto) y refresca la sesión si caducó;
  // no consulta al servidor de Auth en cada petición.
  const { data: verified } = await supabase.auth.getClaims();
  const user = verified?.claims ?? null;

  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // Latido del cron de Vercel: no necesita sesión
  // Los crons de Vercel no traen sesión: /api/ping, la sincronización con el PJUD y las alertas diarias (exigen su propio secreto)
  if (path === "/api/ping" || path === "/api/pjud/sync" || path === "/api/cron/alertas") return response;
  if (!user) {
    const next = path === "/login" ? "" : `?next=${encodeURIComponent(request.nextUrl.href)}`;
    return NextResponse.redirect(`${CRM_URL}/login${next}`);
  }
  if (user && path === "/login") return redirectTo("/clientes");

  return response;
}

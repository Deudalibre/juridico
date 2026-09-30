import { NextResponse, type NextRequest } from "next/server";
import { authUrl, googleConfigured } from "@/lib/google";
import { getContext } from "@/lib/data";

// Inicia la autorización del Google Drive del estudio (solo quien administra la configuración).
export async function GET(req: NextRequest) {
  const { can } = await getContext();
  const origin = req.nextUrl.origin;
  const back = (msg: string) => NextResponse.redirect(`${origin}/configuracion?toast=${encodeURIComponent(msg)}`);
  if (!can("legal.settings")) return back("Solo el administrador conecta el Drive");
  if (!googleConfigured()) return back("Google Drive aún no está configurado en el servidor: faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET");
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(`${origin}/api/google/callback`, state));
  res.cookies.set("gdrive_state", state, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), maxAge: 600, path: "/" });
  return res;
}

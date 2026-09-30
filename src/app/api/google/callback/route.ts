import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, userEmail } from "@/lib/google";
import { getContext } from "@/lib/data";

// Google devuelve aquí el código de autorización: se guarda la conexión del estudio (refresh token en la bóveda).
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (msg: string) => {
    const res = NextResponse.redirect(`${origin}/configuracion?toast=${encodeURIComponent(msg)}`);
    res.cookies.delete("gdrive_state");
    return res;
  };
  const { supabase, can } = await getContext();
  if (!can("legal.settings")) return back("Solo el administrador conecta el Drive");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (req.nextUrl.searchParams.get("error")) return back("No se pudo conectar: autorización cancelada en Google");
  if (!code || !state || state !== req.cookies.get("gdrive_state")?.value) return back("No se pudo conectar: la solicitud no es válida");

  try {
    const tokens = await exchangeCode(code, `${origin}/api/google/callback`);
    if (!tokens.refresh_token) return back("No se pudo conectar: Google no entregó acceso sin conexión. Quita el acceso de la app en tu cuenta de Google y vuelve a intentarlo.");
    const email = await userEmail(tokens.access_token);
    const { error } = await supabase.rpc("drive_connect", {
      p_email: email,
      p_refresh: tokens.refresh_token,
      p_access: tokens.access_token,
      p_expires_at: new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString(),
    });
    if (error) return back(`No se pudo guardar la conexión: ${error.message}`);
    return back(`Google Drive conectado con ${email}. Ahora indica la carpeta raíz de clientes.`);
  } catch (e) {
    return back(`No se pudo conectar: ${(e as Error).message}`);
  }
}

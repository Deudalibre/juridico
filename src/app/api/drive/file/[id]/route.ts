import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/data";
import { driveAccess } from "@/lib/google";

/**
 * Sirve el contenido de un archivo del Drive del estudio con la conexión de la app, para que la carpeta universal lo
 * muestre sin que cada usuario tenga que iniciar sesión en Google. Solo lectura (documents.view). Los documentos
 * nativos de Google (Docs, Sheets) se exportan a PDF.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return new NextResponse("Archivo no válido", { status: 400 });
  const { supabase, can } = await getContext();
  if (!can("documents.view")) return new NextResponse("Sin permiso", { status: 403 });
  const access = await driveAccess(supabase).catch(() => null);
  if (!access) return new NextResponse("Google Drive no está conectado", { status: 503 });

  const headers = { Authorization: `Bearer ${access}` };
  const meta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=name,mimeType,size&supportsAllDrives=true`, { headers });
  if (!meta.ok) return new NextResponse("No se encontró el archivo en el Drive", { status: meta.status === 404 ? 404 : 502 });
  const { name, mimeType } = (await meta.json()) as { name: string; mimeType: string };

  const native = mimeType.startsWith("application/vnd.google-apps.");
  const url = native
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=application/pdf`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  const file = await fetch(url, { headers });
  if (!file.ok || !file.body) return new NextResponse("No se pudo leer el archivo", { status: 502 });

  const download = req.nextUrl.searchParams.get("descargar") === "1";
  const fileName = native ? `${name}.pdf` : name;
  return new NextResponse(file.body, {
    status: 200,
    headers: {
      "Content-Type": native ? "application/pdf" : mimeType || "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

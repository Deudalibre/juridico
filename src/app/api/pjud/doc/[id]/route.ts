import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/lib/data";

/**
 * Sirve un PDF del Poder Judicial guardado en Vercel Blob (store privado): la fila de pjud_documentos se lee como el
 * usuario (RLS: legal.view) y el archivo se trae con el token de la app, así nadie necesita el token ni el Blob queda
 * abierto al público. `?descargar=1` lo baja en vez de abrirlo. Lo usa «Ver PDF» en la Ficha jurídica.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Documento no válido", { status: 400 });
  const { supabase, can } = await getContext();
  if (!can("legal.view")) return new NextResponse("Sin permiso", { status: 403 });
  const { data: doc } = await supabase.from("pjud_documentos").select("blob_key, blob_url, estado, folio, tipo, cuaderno, client_id").eq("id", id).maybeSingle();
  if (!doc || doc.estado !== "done" || !(doc.blob_key || doc.blob_url)) return new NextResponse("El PDF todavía no está descargado", { status: 404 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new NextResponse("Falta BLOB_READ_WRITE_TOKEN en el servidor", { status: 503 });

  let blob: Awaited<ReturnType<typeof get>>;
  try {
    blob = await get((doc.blob_key as string) || (doc.blob_url as string), { access: "private", token });
  } catch (e) {
    console.error(`[pjud/doc] no se pudo leer ${doc.blob_key}:`, (e as Error).message);
    return new NextResponse(`No se pudo leer el archivo del almacenamiento: ${(e as Error).message}`, { status: 502 });
  }
  if (!blob?.stream) return new NextResponse("No se encontró el archivo en el almacenamiento", { status: 404 });

  const descargar = req.nextUrl.searchParams.get("descargar") === "1";
  const nombre = doc.folio ? `${doc.tipo}-folio-${doc.folio}.pdf` : `${doc.tipo}.pdf`;
  return new NextResponse(blob.stream, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${descargar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

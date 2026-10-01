// Subida de archivos de una causa desde el navegador al bucket privado (misma ruta que la pestaña Documentos).
// Devuelve lo que necesitan las acciones de servidor para registrar el documento.
import { createClient } from "@/lib/supabase/client";
import { DOC_MAX_BYTES, DOC_MIMES } from "@/lib/legal";

export type UploadedFile = { path: string; size: number; mime: string; fileName: string };

export async function uploadCaseFile(clientId: string, file: File): Promise<UploadedFile> {
  if (!(file.type in DOC_MIMES)) throw new Error("Tipo de archivo no admitido: usa PDF, JPG, PNG, DOC o DOCX.");
  if (file.size > DOC_MAX_BYTES) throw new Error("El archivo supera los 25 MB.");
  const path = `${clientId}/${crypto.randomUUID()}.${DOC_MIMES[file.type]}`;
  const { error } = await createClient().storage.from("legal-documents").upload(path, file, { contentType: file.type, upsert: false, cacheControl: "0" });
  if (error) throw new Error(`No se pudo subir el archivo: ${error.message}`);
  return { path, size: file.size, mime: file.type, fileName: file.name };
}

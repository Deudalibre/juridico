import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/data";
import { readDocx, type DocModel } from "@/lib/docx";
import { TEMPLATE_BUCKET, type LegalTemplate } from "@/lib/templates";
import { TemplateEditor } from "./TemplateEditor";

// Editor de una plantilla: el documento a la izquierda (se selecciona texto y se convierte en variable)
// y el panel de variables a la derecha. Misma estructura que la ficha del cliente: cabecera, y 1fr + columna fija.
export default async function PlantillaPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, can } = await requirePermission("documents.view");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await supabase.from("legal_templates").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const tpl = data as LegalTemplate;

  let doc: DocModel = { blocks: [], paragraphs: 0 };
  let docError: string | null = null;
  try {
    const { data: file, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(tpl.storage_path);
    if (error || !file) throw new Error(error?.message ?? "No se pudo leer el archivo.");
    doc = readDocx(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    docError = (e as Error).message;
  }
  const { data: clients } = await supabase.from("legal_clients").select("id, full_name").is("archived_at", null).order("full_name").limit(300);

  return (
    <>
      <div className="flex items-center gap-2 px-1 pt-1 text-[12.5px] text-muted">
        <Link href="/plantillas" className="link-muted">
          ← Volver a plantillas
        </Link>
      </div>
      <TemplateEditor template={tpl} doc={doc} docError={docError} clients={(clients ?? []) as { id: string; full_name: string }[]} canEdit={can("documents.edit")} canManage={can("documents.manage")} />
    </>
  );
}

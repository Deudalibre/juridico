"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PROCEDURES } from "@/lib/legal";
import { DOCX_MIME, TEMPLATE_BUCKET, TEMPLATE_MAX_BYTES } from "@/lib/templates";
import { Field, toast } from "@/components/ui";
import { registerTemplate } from "./actions";

/** «+ Subir plantilla»: el Word sube directo al bucket privado desde el navegador y luego se registra en la base. */
export function NewTemplate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [procedure, setProcedure] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const pick = (f: File | null) => {
    setFile(f);
    if (f && !name) setName(f.name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ").trim());
  };

  const submit = async () => {
    if (!file) return toast("Elige el archivo Word (.docx).", true);
    if (file.type !== DOCX_MIME && !/\.docx$/i.test(file.name)) return toast("Solo se admiten archivos Word .docx (no .doc).", true);
    if (file.size > TEMPLATE_MAX_BYTES) return toast("El archivo supera los 25 MB.", true);
    if (!name.trim()) return toast("Indica el nombre de la plantilla.", true);
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      const path = `${id}/v1.docx`;
      const { error } = await createClient().storage.from(TEMPLATE_BUCKET).upload(path, file, { contentType: DOCX_MIME, upsert: false, cacheControl: "0" });
      if (error) return toast(`No se pudo subir: ${error.message}`, true);
      const r = await registerTemplate(id, { name, procedure: procedure || null, path, fileName: file.name, size: file.size });
      if (r.error) return toast(r.error, true);
      toast("Plantilla subida");
      router.push(`/plantillas/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-20">
      <button type="button" className="btn-primary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        + Subir plantilla
      </button>
      {open && (
        <div className="panel absolute right-0 top-[calc(100%+6px)] w-[360px] p-4 shadow-lg" role="dialog" aria-label="Subir plantilla">
          <div className="flex flex-col gap-3">
            <Field label="Archivo Word (.docx)">
              <input ref={input} type="file" accept=".docx" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              <button type="button" className="btn-outline w-full justify-start truncate" onClick={() => input.current?.click()}>
                {file ? file.name : "Elegir archivo…"}
              </button>
            </Field>
            <Field label="Nombre">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Declaración jurada" maxLength={120} />
            </Field>
            <Field label="Procedimiento">
              <select className="input" value={procedure} onChange={(e) => setProcedure(e.target.value)}>
                <option value="">Todos</option>
                {PROCEDURES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Subiendo…" : "Subir y abrir el editor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

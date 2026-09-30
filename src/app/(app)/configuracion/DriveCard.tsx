"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disconnectDrive, setDriveRoot } from "./drive-actions";
import { Field, toast } from "@/components/ui";

type Props = { configured: boolean; connected: boolean; email: string | null; rootName: string | null; rootId: string | null; error: string | null };

/** Tarjeta de Google Drive en Configuración: conectar la cuenta del estudio y fijar la carpeta raíz de clientes. */
export function DriveCard({ configured, connected, email, rootName, rootId, error }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const saveRoot = (fd: FormData) =>
    start(async () => {
      const r = await setDriveRoot(fd);
      if (r.error) toast(r.error, true);
      else {
        toast(`Carpeta raíz: ${r.name}`);
        router.refresh();
      }
    });

  return (
    <section className="panel gap-3 px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="card-title">Google Drive del estudio</span>
        {connected ? <span className="badge success">Conectado</span> : <span className="badge warning">No conectado</span>}
      </div>
      {!configured ? (
        <span className="text-[13px] text-soft">
          Falta configurar <code>GOOGLE_CLIENT_ID</code> y <code>GOOGLE_CLIENT_SECRET</code> en el servidor (proyecto de Google Cloud con la API de Drive y la URI de
          redirección <code>/api/google/callback</code>).
        </span>
      ) : !connected ? (
        <>
          <span className="text-[13px] text-soft">Conecta la cuenta de Google que es dueña de las carpetas de clientes. La app solo lee el Drive y puede guardar archivos en esas carpetas; nunca borra nada.</span>
          <a href="/api/google/connect" className="btn-primary self-start">
            Conectar Google Drive
          </a>
        </>
      ) : (
        <>
          <span className="text-[13px] text-soft">
            Cuenta: <b>{email}</b>
            {error && <span className="ml-2 text-danger">· último error: {error}</span>}
          </span>
          <form action={saveRoot} className="flex flex-col gap-2">
            <Field label="Carpeta raíz de clientes (enlace del Drive)">
              <input name="root" className="input" defaultValue={rootId ? `https://drive.google.com/drive/folders/${rootId}` : ""} placeholder="https://drive.google.com/drive/folders/…" disabled={pending} />
            </Field>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted">{rootName ? `Actual: ${rootName}. Dentro de ella se buscan las carpetas por RUT o nombre del cliente.` : "Dentro de ella se buscan las carpetas por RUT o nombre del cliente."}</span>
              <button className="btn-primary btn-sm" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </form>
          <div className="flex gap-2">
            <a href="/api/google/connect" className="btn-ghost btn-sm">
              Volver a conectar
            </a>
            <button
              className="btn-ghost btn-sm text-danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await disconnectDrive();
                  if (r.error) toast(r.error, true);
                  else {
                    toast("Google Drive desconectado");
                    router.refresh();
                  }
                })
              }
            >
              Desconectar
            </button>
          </div>
        </>
      )}
    </section>
  );
}

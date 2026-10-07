"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createDriveRoot, disconnectDrive, setDriveRoot } from "./drive-actions";
import { Field, toast } from "@/components/ui";
import { Icon } from "@/components/icons";

type Props = { configured: boolean; connected: boolean; email: string | null; rootName: string | null; rootId: string | null; error: string | null };

/**
 * Tarjeta de Google Drive en Configuración: conectar la cuenta del estudio y fijar la carpeta universal (dentro de
 * ella la app crea una carpeta por cliente con sus documentos generados). La carpeta la crea la app con un clic;
 * también se puede pegar una ya existente, pero la app solo puede escribir en las que creó ella misma.
 */
export function DriveCard({ configured, connected, email, rootName, rootId, error }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const saveRoot = (fd: FormData) =>
    start(async () => {
      const r = await setDriveRoot(fd);
      if (r.error) toast(r.error, true);
      else {
        toast(`Carpeta universal: ${r.name}`);
        router.refresh();
      }
    });
  const crear = () =>
    start(async () => {
      const r = await createDriveRoot();
      if (r.error) toast(r.error, true);
      else {
        toast(`Carpeta universal creada en el Drive: ${r.name}`);
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
          <span className="text-[13px] text-soft">Conecta la cuenta de Google del estudio. La app lee el Drive y guarda los documentos generados en una carpeta por cliente; nunca borra nada.</span>
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

          {rootId ? (
            <div className="flex flex-col gap-1 rounded-md border border-line px-3 py-2">
              <span className="text-[12px] text-muted">Carpeta universal</span>
              <a href={`https://drive.google.com/drive/folders/${rootId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent hover:underline">
                <Icon name="folder" size={14} /> {rootName ?? rootId}
              </a>
              <span className="text-[12px] text-faint">Dentro de ella la app crea una carpeta por cliente (NOMBRE COMPLETO) y guarda ahí los anexos y la solicitud que genera.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-dashed border-line px-3 py-3">
              <span className="text-[13px] font-medium">Falta la carpeta universal</span>
              <span className="text-[12.5px] text-soft">Es la carpeta donde quedan todos los clientes, cada uno en su carpeta. Lo más simple es que la cree la app en «Mi unidad» de {email}.</span>
              <button type="button" className="btn-primary btn-sm self-start" disabled={pending} onClick={crear}>
                {pending ? "Creando…" : "Crear carpeta universal en el Drive"}
              </button>
            </div>
          )}

          <details className="text-[12.5px]">
            <summary className="cursor-pointer text-muted">{rootId ? "Cambiar por una carpeta existente" : "Usar una carpeta existente"}</summary>
            <form action={saveRoot} className="mt-2 flex flex-col gap-2">
              <Field label="Enlace de la carpeta en el Drive">
                <input name="root" className="input" placeholder="https://drive.google.com/drive/folders/…" disabled={pending} />
              </Field>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-faint">Ojo: la app solo puede escribir dentro de carpetas que creó ella misma. Si pegas otra, podrá leerla pero no guardar ahí.</span>
                <button className="btn-secondary btn-sm" disabled={pending}>
                  {pending ? "Guardando…" : "Usar esta"}
                </button>
              </div>
            </form>
          </details>

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

import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { Icon } from "@/components/icons";
import { requirePermission } from "@/lib/data";
import { driveAccess, driveState, getFolder, listFolder, type DriveFile, type DriveFolder } from "@/lib/google";
import { CarpetaUniversal } from "./CarpetaUniversal";

// Carpeta universal: todo lo que hay en el Drive del estudio (una carpeta por cliente) con vista previa al lado.
// Título de la pestaña del navegador (el layout añade « · Deuda Libre»)
export const metadata = { title: "Carpeta universal" };

type SP = { carpeta?: string; archivo?: string; q?: string };

/**
 * La carga de datos vive en DocumentosContent, dentro de un <Suspense> con el esqueleto de loading.tsx. Así la navegación a
 * esta pantalla es instantánea (Next 16 lo valida en desarrollo): marco y esqueleto aparecen al clic y los datos
 * entran en streaming. loading.tsx solo cubre la carga directa, no la navegación entre pantallas.
 */
export default function DocumentosPage(props: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<Loading />}>
      <DocumentosContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DocumentosContent(props: { searchParams: Promise<SP> }) {
  const { supabase, can } = await requirePermission("documents.view");
  const sp = await props.searchParams;
  const state = await driveState(supabase);
  const q = (sp.q ?? "").trim();
  const carpetaId = /^[A-Za-z0-9_-]{10,}$/.test(sp.carpeta ?? "") ? sp.carpeta! : null;
  const archivoId = /^[A-Za-z0-9_-]{10,}$/.test(sp.archivo ?? "") ? sp.archivo! : null;

  let error: string | null = null;
  let root: DriveFolder | null = null;
  let carpeta: DriveFolder | null = null;
  let items: DriveFile[] = [];
  if (state.connected && state.rootId) {
    try {
      const access = await driveAccess(supabase);
      if (access) {
        root = { id: state.rootId, name: state.rootName ?? "Carpeta universal", webViewLink: `https://drive.google.com/drive/folders/${state.rootId}` };
        carpeta = carpetaId && carpetaId !== state.rootId ? await getFolder(access, carpetaId) : null;
        items = await listFolder(access, carpeta?.id ?? state.rootId);
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
  if (q) {
    const n = q.toLowerCase();
    items = items.filter((f) => f.name.toLowerCase().includes(n));
  }

  return (
    <>
      <div className="page-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="folder" size={18} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="page-title">Carpeta universal</h1>
            <span className="page-subtitle">
              {root ? (
                <>
                  Todo lo que hay en el Drive del estudio, una carpeta por cliente ·{" "}
                  <a href={root.webViewLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {root.name}
                  </a>
                </>
              ) : (
                "Los documentos del estudio, una carpeta por cliente, con vista previa al lado"
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative" role="search">
            {carpeta && <input type="hidden" name="carpeta" value={carpeta.id} />}
            <input name="q" defaultValue={q} className="search" placeholder={carpeta ? "Buscar archivo…" : "Buscar cliente…"} aria-label="Buscar en la carpeta" autoComplete="off" />
          </form>
          {carpeta && (
            <Link href="/documentos" className="btn-secondary btn-sm">
              <span className="inline-flex rotate-180">
                <Icon name="chevron" size={13} />
              </span>
              Todas las carpetas
            </Link>
          )}
        </div>
      </div>

      {!state.connected ? (
        <Vacio titulo="Google Drive no está conectado" texto={can("legal.settings") ? "Conéctalo en Configuración para ver aquí la carpeta universal." : "Pídele al administrador que lo conecte en Configuración."} accion={can("legal.settings") ? { href: "/configuracion", label: "Ir a Configuración" } : null} />
      ) : !state.rootId ? (
        <Vacio titulo="Falta la carpeta universal" texto={can("legal.settings") ? "Créala con un clic en Configuración: dentro de ella la app guarda una carpeta por cliente." : "Pídele al administrador que la cree en Configuración."} accion={can("legal.settings") ? { href: "/configuracion", label: "Ir a Configuración" } : null} />
      ) : error ? (
        <Vacio titulo="No se pudo leer el Drive" texto={error} accion={null} />
      ) : (
        <CarpetaUniversal key={carpeta?.id ?? "raiz"} items={items} carpeta={carpeta} rootName={root?.name ?? "Carpeta universal"} archivoId={archivoId} q={q} />
      )}
    </>
  );
}

function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion: { href: string; label: string } | null }) {
  return (
    <section className="panel empty">
      <span className="icon-tile">
        <Icon name="folder" />
      </span>
      <span className="empty-title">{titulo}</span>
      <span className="empty-text">{texto}</span>
      {accion && (
        <Link href={accion.href} className="btn-primary btn-sm mt-2">
          {accion.label}
        </Link>
      )}
    </section>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { Icon } from "@/components/icons";
import { requirePermission } from "@/lib/data";
import { driveAccess, driveIdFromUrl, driveState, getFolder, listFolder, type DriveFile, type DriveFolder } from "@/lib/google";
import { CarpetaUniversal, type ClienteCarpeta } from "./CarpetaUniversal";

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
  // Qué carpeta del Drive es de qué causa (para mostrar RUT y N° y enlazar al expediente desde la lista)
  const clientes: Record<string, ClienteCarpeta> = {};
  if (state.connected && state.rootId) {
    try {
      const access = await driveAccess(supabase);
      if (access) {
        root = { id: state.rootId, name: state.rootName ?? "Carpeta universal", webViewLink: `https://drive.google.com/drive/folders/${state.rootId}` };
        const [c, lista, { data: causas }] = await Promise.all([
          carpetaId && carpetaId !== state.rootId ? getFolder(access, carpetaId) : Promise.resolve(null),
          listFolder(access, carpetaId && carpetaId !== state.rootId ? carpetaId : state.rootId),
          supabase.from("legal_clients").select("id, full_name, rut, internal_number, drive_folder_url, archived_at").not("drive_folder_url", "is", null).limit(2000),
        ]);
        carpeta = c;
        // Si la carpeta pedida no existe o no es accesible, se vuelve a la raíz (la lista ya es la de la raíz)
        items = carpetaId && carpetaId !== state.rootId && !c ? await listFolder(access, state.rootId) : lista;
        for (const row of causas ?? []) {
          const id = driveIdFromUrl(row.drive_folder_url as string | null);
          if (id) clientes[id] = { id: row.id as string, full_name: row.full_name as string, rut: (row.rut as string | null) ?? null, internal_number: (row.internal_number as string | null) ?? null, cerrada: Boolean(row.archived_at) };
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
  if (q) {
    const n = q.toLowerCase();
    items = items.filter((f) => f.name.toLowerCase().includes(n) || (clientes[f.id]?.rut ?? "").includes(n.replace(/[^0-9k]/gi, "")));
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
            <span className="page-subtitle">Los documentos del estudio en el Drive, una carpeta por cliente, con vista previa al lado</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="relative" role="search">
            {carpeta && <input type="hidden" name="carpeta" value={carpeta.id} />}
            <input name="q" defaultValue={q} className="search" placeholder={carpeta ? "Buscar archivo…" : "Buscar cliente o RUT…"} aria-label="Buscar en la carpeta" autoComplete="off" />
          </form>
          {root && (
            <a href={(carpeta ?? root).webViewLink} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm" title="Abrir esta carpeta en Google Drive">
              <Icon name="external" size={13} /> Abrir en Drive
            </a>
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
        <CarpetaUniversal key={carpeta?.id ?? "raiz"} items={items} carpeta={carpeta} root={root!} clientes={clientes} archivoId={archivoId} q={q} />
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

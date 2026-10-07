import Link from "next/link";
import { Suspense } from "react";
import Loading from "@/app/(app)/loading";
import { Icon } from "@/components/icons";
import { requirePermission } from "@/lib/data";
import { driveAccess, driveIdFromUrl, driveState, getFolder, listFolder, type DriveFile, type DriveFolder } from "@/lib/google";
import { CarpetaUniversal, type ClienteCarpeta } from "./CarpetaUniversal";

// Carpeta universal: todo lo que hay en el Drive del estudio (una carpeta por cliente) con vista previa al lado.
// Mismo marco que «Todos los leads» del CRM: cabecera, lateral de filtros (aquí los clientes) y tabla densa.
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
  const carpetaId = /^[A-Za-z0-9_-]{10,}$/.test(sp.carpeta ?? "") && sp.carpeta !== state.rootId ? sp.carpeta! : null;
  const archivoId = /^[A-Za-z0-9_-]{10,}$/.test(sp.archivo ?? "") ? sp.archivo! : null;

  let error: string | null = null;
  let root: DriveFolder | null = null;
  let carpeta: DriveFolder | null = null;
  let raiz: DriveFile[] = []; // carpetas de clientes (y archivos sueltos) en la carpeta universal
  let items: DriveFile[] = []; // lo que hay en la carpeta abierta
  // Qué carpeta del Drive es de qué causa (para mostrar RUT y N° y enlazar al expediente desde la lista)
  const clientes: Record<string, ClienteCarpeta> = {};
  if (state.connected && state.rootId) {
    try {
      const access = await driveAccess(supabase);
      if (access) {
        root = { id: state.rootId, name: state.rootName ?? "Carpeta universal", webViewLink: `https://drive.google.com/drive/folders/${state.rootId}` };
        const [c, listaRaiz, listaCarpeta, { data: causas }] = await Promise.all([
          carpetaId ? getFolder(access, carpetaId) : Promise.resolve(null),
          listFolder(access, state.rootId),
          carpetaId ? listFolder(access, carpetaId).catch(() => [] as DriveFile[]) : Promise.resolve([] as DriveFile[]),
          supabase.from("legal_clients").select("id, full_name, rut, internal_number, drive_folder_url, archived_at").not("drive_folder_url", "is", null).limit(2000),
        ]);
        carpeta = c;
        raiz = listaRaiz;
        items = c ? listaCarpeta : listaRaiz;
        for (const row of causas ?? []) {
          const id = driveIdFromUrl(row.drive_folder_url as string | null);
          if (id) clientes[id] = { id: row.id as string, full_name: row.full_name as string, rut: (row.rut as string | null) ?? null, internal_number: (row.internal_number as string | null) ?? null, cerrada: Boolean(row.archived_at) };
        }
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
  const nClientes = raiz.filter((f) => f.isFolder).length;

  return (
    <div className="frame" style={{ height: "calc(100vh - 58px)" }}>
      {/* Encabezado: ícono, título, descripción y acciones (como «Todos los leads») */}
      <div className="frame-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="icon-tile solid">
            <Icon name="folder" size={18} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="page-title">Carpeta universal</h1>
            <span className="page-subtitle">{root ? `${nClientes} ${nClientes === 1 ? "cliente" : "clientes"} en el Drive del estudio · anexos y solicitud de cada uno, con vista previa` : "Los documentos del estudio en el Drive, una carpeta por cliente, con vista previa al lado"}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {root && (
            <a href={(carpeta ?? root).webViewLink} target="_blank" rel="noopener noreferrer" className="btn-outline" title="Abrir esta carpeta en Google Drive">
              <Icon name="external" size={14} />
              Abrir en Drive
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
        <CarpetaUniversal key={carpeta?.id ?? "raiz"} raiz={raiz} items={items} carpeta={carpeta} root={root!} clientes={clientes} archivoId={archivoId} q={q} />
      )}
    </div>
  );
}

function Vacio({ titulo, texto, accion }: { titulo: string; texto: string; accion: { href: string; label: string } | null }) {
  return (
    <div className="empty flex-1">
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
    </div>
  );
}

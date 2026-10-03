"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/LinkPending";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { initials } from "@/lib/format";
import { ROLE_LABEL, type Permission, type Role } from "@/lib/permissions";
import { signOut } from "@/app/(auth)/actions";
import { Notifications } from "./Notifications";

// Marco de la app jurídica, calcado del AppShell del CRM: barra lateral con insignia de alertas,
// submenú por sección, barra superior con acceso rápido, notificaciones y menú de usuario.

type Props = {
  children: ReactNode;
  userId: string;
  name: string;
  role: Role;
  permissions: Permission[];
  /** Insignia de «Revisión» (causas por revisar, tareas vencidas): se cuenta aparte y llega en streaming */
  badge?: ReactNode;
  crmUrl: string;
};

type NavLink = {
  href: string;
  label: string;
  icon: string;
  match: (p: string) => boolean;
};
type SubItem = {
  href: string;
  label: string;
  icon: string;
  need?: Permission;
  group?: string;
  exact?: boolean;
  query?: string;
};

const starts = (p: string, base: string) => p === base || p.startsWith(base + "/");

const SECTIONS: {
  match: (p: string) => boolean;
  title: string;
  items: SubItem[];
}[] = [
  {
    match: (p) => starts(p, "/revision"),
    title: "Revisión",
    items: [
      {
        href: "/revision",
        label: "Por revisar",
        icon: "today",
        group: "Seguimiento",
        exact: true,
      },
      {
        href: "/revision/historial",
        label: "Historial de revisiones",
        icon: "history",
        group: "Seguimiento",
      },
      {
        href: "/revision/tareas",
        label: "Tareas cerradas",
        icon: "check",
        group: "Seguimiento",
      },
      {
        href: "/clientes",
        label: "Todas las causas",
        icon: "user",
        group: "Causas",
      },
    ],
  },
  {
    match: (p) => starts(p, "/plantillas"),
    title: "Plantillas",
    items: [
      { href: "/plantillas", label: "Modelos Word", icon: "folder", group: "Plantillas", exact: true },
      { href: "/plantillas/variables", label: "Variables del estudio", icon: "tag", group: "Plantillas" },
    ],
  },
  {
    match: (p) => starts(p, "/clientes"),
    title: "Clientes",
    items: [
      {
        href: "/clientes",
        label: "Causas activas",
        icon: "user",
        group: "Causas",
        exact: true,
      },
      {
        href: "/clientes?estado=cerradas",
        label: "Causas cerradas",
        icon: "lost",
        group: "Causas",
        query: "estado=cerradas",
      },
      {
        href: "/clientes/nuevo",
        label: "Nuevo cliente",
        icon: "plus",
        group: "Causas",
        need: "legal.create",
      },
      {
        href: "/revision",
        label: "Por revisar",
        icon: "today",
        group: "Seguimiento",
        exact: true,
      },
    ],
  },
];

const CRUMBS: [RegExp, string[]][] = [
  [/^\/revision\/historial/, ["Revisión", "Historial"]],
  [/^\/revision\/tareas/, ["Revisión", "Tareas cerradas"]],
  [/^\/revision/, ["Revisión", "Por revisar"]],
  [/^\/clientes\/nuevo/, ["Clientes", "Nuevo cliente"]],
  [/^\/clientes\/.+/, ["Clientes", "Ficha del cliente"]],
  [/^\/clientes/, ["Clientes"]],
  [/^\/plantillas\/variables/, ["Plantillas", "Variables del estudio"]],
  [/^\/plantillas\/.+/, ["Plantillas", "Editor de plantilla"]],
  [/^\/plantillas/, ["Plantillas"]],
  [/^\/documentos/, ["Documentos"]],
  [/^\/configuracion/, ["Configuración"]],
];

const CRUMB_ICON: Record<string, string> = {
  Revisión: "today",
  Clientes: "user",
  Plantillas: "folder",
  Documentos: "report",
  Configuración: "settings",
};

/**
 * Marca de la opción activa. Lleva un nombre de transición compartido: al navegar, React y la
 * View Transitions API la deslizan desde la opción anterior hasta la nueva en vez de encenderla de golpe.
 */
function RailMarker() {
  return (
    <ViewTransition name="rail-active" share="nav-marker">
      <span className="rail-marker" aria-hidden />
    </ViewTransition>
  );
}
function SubmenuMarker() {
  return (
    <ViewTransition name="submenu-active" share="nav-marker">
      <span className="submenu-marker" aria-hidden />
    </ViewTransition>
  );
}

function UserMenu({ name, role, crmUrl }: { name: string; role: Role; crmUrl: string }) {
  return (
    <Menu
      trigger={
        <button className="flex items-center gap-2 rounded-md border-0 bg-transparent p-1 pr-2 hover:bg-surface-2" aria-label="Menú de usuario">
          <span className="avatar solid h-8 w-8 text-[11px]">{initials(name) || "?"}</span>
        </button>
      }
    >
      <MenuLabel>
        <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
        <span className="block text-xs text-muted">{ROLE_LABEL[role]}</span>
      </MenuLabel>
      <MenuSeparator />
      <MenuItem asChild>
        <a href={`${crmUrl}/ajustes`}>
          <Icon name="user" size={16} /> Mi cuenta
        </a>
      </MenuItem>
      <MenuItem asChild>
        <a href={crmUrl}>
          <Icon name="leads" size={16} /> Ir al CRM
        </a>
      </MenuItem>
      <MenuItem onSelect={() => signOut()}>
        <Icon name="logout" size={16} /> Cerrar sesión
      </MenuItem>
    </Menu>
  );
}

export function AppShell({ children, userId, name, role, permissions, badge, crmUrl }: Props) {
  const path = usePathname();
  const search = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  const can = (p: Permission) => permissions.includes(p);

  const nav: NavLink[] = [
    {
      href: "/revision",
      label: "Revisión",
      icon: "today",
      match: (p) => starts(p, "/revision"),
    },
    {
      href: "/clientes",
      label: "Clientes",
      icon: "user",
      match: (p) => starts(p, "/clientes"),
    },
  ];
  if (can("documents.view")) {
    nav.push({
      href: "/plantillas",
      label: "Plantillas",
      icon: "folder",
      match: (p) => starts(p, "/plantillas"),
    });
    nav.push({
      href: "/documentos",
      label: "Documentos",
      icon: "report",
      match: (p) => starts(p, "/documentos"),
    });
  }

  const rawSection = SECTIONS.find((s) => s.match(path));
  const items = rawSection?.items.filter((i) => !i.need || can(i.need)) ?? [];
  const section = rawSection && items.length > 1 ? { ...rawSection, items } : null;
  const crumbs = CRUMBS.find(([re]) => re.test(path))?.[1] ?? [];
  const isActive = (i: SubItem) => {
    const base = i.href.split("?")[0];
    const hit = i.exact ? path === base : starts(path, base);
    if (!hit) return false;
    if (i.query) return search.toString().includes(i.query);
    // «Causas activas» no se marca cuando se están viendo las cerradas
    return !(base === "/clientes" && search.get("estado") === "cerradas" && i.exact);
  };

  return (
    <div className="shell">
      <nav className="rail" aria-label="Navegación principal">
        <Link href="/revision" className="rail-brand" title="Deuda Libre · Jurídico" aria-label="Deuda Libre · inicio">
          DL
        </Link>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="rail-item" aria-current={n.match(path) ? "page" : undefined}>
            <LinkPending />
            {n.match(path) && <RailMarker />}
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.href === "/revision" && badge}
          </Link>
        ))}
        <a href={crmUrl} className="rail-item" title="Volver al CRM comercial">
          <Icon name="leads" />
          <span>CRM</span>
        </a>
        <div className="rail-spacer flex-1" />
        {can("legal.settings") && (
          <Link href="/configuracion" className="rail-item" aria-current={starts(path, "/configuracion") ? "page" : undefined}>
            <LinkPending />
            {starts(path, "/configuracion") && <RailMarker />}
            <Icon name="settings" />
            <span>Configuración</span>
          </Link>
        )}
      </nav>

      {section && (
        <aside className={`submenu ${menuOpen ? "open" : ""}`} aria-label={section.title}>
          <span className="submenu-title">{section.title}</span>
          {section.items.map((i, k) => (
            <div key={i.href} className="contents">
              {i.group && i.group !== section.items[k - 1]?.group && <span className="submenu-group">{i.group}</span>}
              <Link href={i.href} className="submenu-item" aria-current={isActive(i) ? "page" : undefined}>
                <LinkPending />
                {isActive(i) && <SubmenuMarker />}
                <Icon name={i.icon} size={15} />
                {i.label}
              </Link>
            </div>
          ))}
        </aside>
      )}

      <div className="workspace">
        <header className="topbar">
          <div className="crumbs">
            {section && (
              <button className="icon-btn plain submenu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Mostrar submenú" aria-expanded={menuOpen}>
                <Icon name="sidebar" size={18} />
              </button>
            )}
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Icon name="folder" size={14} />
              Jurídico
            </span>
            {crumbs.map((c, i) => (
              <span key={c} className="flex min-w-0 items-center gap-1.5">
                <span className="text-faint">
                  <Icon name="chevron" size={13} />
                </span>
                {i === crumbs.length - 1 ? (
                  <strong>
                    {CRUMB_ICON[c] && <Icon name={CRUMB_ICON[c]} size={14} />}
                    {c}
                  </strong>
                ) : (
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    {CRUMB_ICON[c] && <Icon name={CRUMB_ICON[c]} size={14} />}
                    {c}
                  </span>
                )}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Link href="/revision" className="topbar-btn" title="Causas por revisar" aria-label="Causas por revisar">
              <Icon name="tasks" size={15} />
            </Link>
            <Notifications userId={userId} />
            <UserMenu name={name} role={role} crmUrl={crmUrl} />
          </div>
        </header>
        <main className="content">
          <ViewTransition key={path} enter="page-enter" exit="page-exit" default="page-update">
            {children}
          </ViewTransition>
        </main>
      </div>
    </div>
  );
}

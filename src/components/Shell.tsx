"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { ROLE_LABEL, type Permission, type Role } from "@/lib/permissions";
import { signOut } from "@/app/(auth)/actions";

type Props = { children: ReactNode; name: string; role: Role; permissions: Permission[]; crmUrl: string };

const starts = (p: string, base: string) => p === base || p.startsWith(base + "/");

const CRUMBS: [RegExp, string[]][] = [
  [/^\/clientes\/nuevo/, ["Clientes", "Nuevo cliente"]],
  [/^\/clientes\/.+/, ["Clientes", "Ficha del cliente"]],
  [/^\/clientes/, ["Clientes"]],
  [/^\/plantillas/, ["Plantillas"]],
  [/^\/documentos/, ["Documentos generados"]],
  [/^\/configuracion/, ["Configuración"]],
];

function UserMenu({ name, role, crmUrl }: { name: string; role: Role; crmUrl: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-lg border-0 bg-transparent p-1 pr-2 hover:bg-surface-2" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Menú de usuario">
        <span className="avatar h-8 w-8 text-[11px]">{initials(name) || "?"}</span>
        <span className="hidden max-w-[140px] truncate text-[13px] font-medium text-fg sm:inline">{name}</span>
      </button>
      {open && (
        <div className="popover fade-in !w-56">
          <div className="border-b border-line px-4 py-3">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[role]}</div>
          </div>
          <a href={crmUrl} className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-fg hover:bg-surface-2">
            <Icon name="leads" size={16} /> Ir al CRM
          </a>
          <form action={signOut}>
            <button className="flex w-full items-center gap-2 border-0 bg-transparent px-4 py-2.5 text-left text-[13px] text-fg hover:bg-surface-2">
              <Icon name="logout" size={16} /> Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Estructura de la app: barra lateral (Clientes · Plantillas · Documentos · Configuración) y barra superior. */
export function Shell({ children, name, role, permissions, crmUrl }: Props) {
  const path = usePathname();
  const can = (p: Permission) => permissions.includes(p);
  const nav = [
    { href: "/clientes", label: "Clientes", icon: "user", show: can("legal.view") },
    { href: "/plantillas", label: "Plantillas", icon: "folder", show: can("documents.view") },
    { href: "/documentos", label: "Documentos", icon: "report", show: can("documents.view") },
    { href: "/configuracion", label: "Configuración", icon: "settings", show: can("legal.settings") },
  ].filter((n) => n.show);
  const crumbs = CRUMBS.find(([re]) => re.test(path))?.[1] ?? [];

  return (
    <div className="shell">
      <nav className="rail" aria-label="Navegación principal">
        <Link href="/clientes" className="rail-brand" title="Deuda Libre · Jurídico" aria-label="Deuda Libre · inicio">
          DL
        </Link>
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="rail-item" aria-current={starts(path, n.href) ? "page" : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
      <div className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span className="whitespace-nowrap">Jurídico</span>
            {crumbs.map((c, i) => (
              <span key={c} className="flex min-w-0 items-center gap-1.5">
                <span className="text-faint">/</span>
                {i === crumbs.length - 1 ? <strong>{c}</strong> : <span className="whitespace-nowrap">{c}</span>}
              </span>
            ))}
          </div>
          <UserMenu name={name} role={role} crmUrl={crmUrl} />
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

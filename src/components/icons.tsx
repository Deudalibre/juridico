import type { ReactNode } from "react";

// Iconos lineales de un mismo estilo (trazo 1.6 sobre rejilla de 24). Tamaño por defecto 20 px.
function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const paths: Record<string, ReactNode> = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M8.5 14.5l2.3 2.3 4.7-4.7" />
    </>
  ),
  leads: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </>
  ),
  funnel: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z" />,
  channels: (
    <>
      <path d="M9 7.5a4.5 4.5 0 0 1 6 0M6.5 5a8 8 0 0 1 11 0" />
      <circle cx="12" cy="11" r="1.6" />
      <path d="M12 12.6V20M8.5 20h7" />
    </>
  ),
  workflows: (
    <>
      <rect x="3" y="4" width="6" height="5" rx="1.5" />
      <rect x="15" y="4" width="6" height="5" rx="1.5" />
      <rect x="9" y="15" width="6" height="5" rx="1.5" />
      <path d="M6 9v2.5a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V9M12 13v2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  report: <path d="M4 20h16M7 16v-5M12 16V6M17 16v-3" />,
  duplicate: (
    <>
      <rect x="4" y="8" width="11" height="12" rx="2" />
      <path d="M9 8V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-3" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3.2 2.5-5.2 5.5-5.2s5.5 2 5.5 5.2M15.5 5.6a3 3 0 0 1 0 5.8M17.5 13.9c1.8.7 3 2.3 3 5.1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 4v4.5H8M12 7.5V12l3 2" />
    </>
  ),
  folder: <path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  list: <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  logout: <path d="M9 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3M15.5 16.5 20 12l-4.5-4.5M20 12H9" />,
  phone: <path d="M8 3.5 6 3a2 2 0 0 0-2.5 1.8C3.4 13 11 20.6 19.2 20.5A2 2 0 0 0 21 18l-.6-2-3.5-1.3-1.7 1.7a9.5 9.5 0 0 1-5.6-5.6L11.3 9 10 5.5 8 3.5Z" />,
  whatsapp: (
    <>
      <path d="M4 20l1.1-3.6A8 8 0 1 1 8.2 19.6L4 20Z" />
      <path d="M8.8 9.2c.2 2.3 2.7 4.8 5.2 5.1l1.1-1.3-1.5-.8-.8.6a4.8 4.8 0 0 1-2.1-2.1l.6-.8-.8-1.5-1.7.8Z" />
    </>
  ),
  chevron: <path d="M9 5.5 15.5 12 9 18.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sidebar: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
};

export function Icon({ name, size }: { name: keyof typeof paths | string; size?: number }) {
  return <Svg size={size}>{paths[name] ?? null}</Svg>;
}

/** Compatibilidad con los usos existentes: ICONS.phone, ICONS.close… (16 px) */
export const ICONS: Record<string, ReactNode> = Object.fromEntries(
  Object.keys(paths).map((k) => [k, <Svg key={k} size={16}>{paths[k]}</Svg>])
);

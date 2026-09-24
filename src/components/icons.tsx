import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarCheck,
  ChevronRight,
  Copy,
  Filter,
  Folder,
  History,
  LayoutGrid,
  Link2,
  List,
  LogOut,
  Menu,
  MessageCircle,
  PanelLeft,
  Phone,
  Plus,
  Radio,
  Settings,
  UserRound,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

// Iconografía: Lucide, un solo trazo (1.6) y un solo tamaño por contexto (20 en navegación, 16 en línea).
// Los nombres se conservan para no tocar las pantallas que los usan.
const ICON: Record<string, LucideIcon> = {
  today: CalendarCheck,
  leads: Users,
  funnel: Filter,
  channels: Radio,
  workflows: Workflow,
  settings: Settings,
  bell: Bell,
  report: BarChart3,
  duplicate: Copy,
  team: Users,
  user: UserRound,
  history: History,
  folder: Folder,
  grid: LayoutGrid,
  list: List,
  link: Link2,
  plus: Plus,
  logout: LogOut,
  phone: Phone,
  whatsapp: MessageCircle,
  chevron: ChevronRight,
  close: X,
  menu: Menu,
  sidebar: PanelLeft,
  alert: AlertTriangle,
};

export function Icon({ name, size = 20 }: { name: keyof typeof ICON | string; size?: number }) {
  const C = ICON[name];
  return C ? <C size={size} strokeWidth={1.6} aria-hidden /> : null;
}

/** Compatibilidad con los usos existentes: ICONS.phone, ICONS.close… (16 px) */
export const ICONS: Record<string, ReactNode> = Object.fromEntries(Object.keys(ICON).map((k) => [k, <Icon key={k} name={k} size={16} />]));

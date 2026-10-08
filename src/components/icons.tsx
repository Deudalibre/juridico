import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { ICON_NAMES } from "@/components/icon-names";

export { Icon };
export { ICON_NAMES, SPRITE, type IconName } from "@/components/icon-names";

/** Compatibilidad con los usos existentes: ICONS.phone, ICONS.close… (16 px) */
export const ICONS: Record<string, ReactNode> = Object.fromEntries(Object.keys(ICON_NAMES).map((k) => [k, <Icon key={k} name={k} size={16} />]));

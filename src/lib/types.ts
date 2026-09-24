/** Estado devuelto por las server actions de formularios (useFormState). */
export type FormState = { errors?: Record<string, string>; message?: string; ok?: boolean } | undefined;

export type { Role } from "./permissions";
import type { Role } from "./permissions";

export interface Profile {
  id: string;
  full_name: string;
  job_title: string;
  email: string;
  agency: string;
  currency: string;
  timezone: string;
  language: string;
  home_screen: string;
  date_format: string;
  role: Role;
  active: boolean;
}

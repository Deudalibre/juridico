import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sessionCookieOptions } from "./cookies";

let client: SupabaseClient | undefined;

export function createClient() {
  client ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: sessionCookieOptions(typeof window === "undefined" ? undefined : window.location.hostname),
  });
  return client;
}

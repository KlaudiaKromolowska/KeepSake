import { createBrowserClient } from "@supabase/ssr";
import { requiredEnv } from "@/lib/env";
import type { Database } from "./database.types";

/** Browser-side Supabase client — safe for Client Components (anon-scoped, RLS-enforced). */
export function createClient() {
  return createBrowserClient<Database>(
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

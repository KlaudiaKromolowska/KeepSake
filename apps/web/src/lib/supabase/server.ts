import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { requiredEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client for Server Components/Actions/Route Handlers — user-scoped
 * (anon key + caller's cookies), RLS-enforced. A fresh client per request (never cached in a
 * module-level variable — see @supabase/ssr Fluid Compute guidance).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — safe to ignore, the proxy refreshes sessions.
          }
        },
      },
    },
  );
}

/**
 * Service-role client — bypasses RLS entirely. SERVER-ONLY, and only for trusted background
 * work (the Task 9 seed script), never a user-request path (CLAUDE.md). This module has no
 * "use client" boundary and is never imported from a Client Component or a browser-reachable
 * path; do not add such an import. `server-only` isn't an existing transitive dependency, so we
 * don't introduce it as a new one — this comment plus code review is the guard instead.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    requiredEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

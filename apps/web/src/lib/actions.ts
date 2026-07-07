import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Repo-wide server-action return shape — actions never throw across the RSC boundary. */
export type ActionResult<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Server-only guard for protected Server Components/Actions: resolves the current user via
 * `getUser()` (never `getSession()` — must be validated against the auth server, not just the
 * cookie payload) and redirects to /login if there isn't one. `redirect()` throws internally;
 * call this before any other logic in a protected route.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { user, supabase };
}

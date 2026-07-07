"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions";
import { failAction } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.email();

/** Sends a magic-link email via signInWithOtp; the link lands on /auth/confirm. */
export async function requestMagicLink(input: unknown): Promise<ActionResult<null>> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: "Enter a valid email address" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data });

  if (error) {
    return failAction(
      "requestMagicLink failed",
      error,
      "Could not send the sign-in link. Please try again.",
    );
  }

  return { data: null, error: null };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * DEMO_MODE-only path (PLAN §12): signs in the seeded demo caregiver directly with a password,
 * bypassing email entirely so the hackathon demo never depends on a mail server. Server-only env
 * check — the caller (login page) must not render the trigger unless DEMO_MODE is set, but this
 * action re-checks so it can't be hit directly when DEMO_MODE is off.
 */
export async function demoSignIn(): Promise<ActionResult<null>> {
  if (process.env.DEMO_MODE !== "1") {
    return { data: null, error: "Demo mode is not enabled" };
  }

  const password = process.env.DEMO_CAREGIVER_PASSWORD;
  if (!password) {
    return { data: null, error: "Demo credentials are not configured" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: "demo@keepsake.test",
    password,
  });

  if (error) {
    return failAction("demoSignIn failed", error, "Could not sign in. Please try again.");
  }

  redirect("/dashboard");
}

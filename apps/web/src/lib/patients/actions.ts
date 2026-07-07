"use server";

import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { createPatientSchema } from "@/lib/patients/schema";
import type { Tables } from "@/lib/supabase/database.types";

export type Patient = Tables<"patients">;

/**
 * Demonstration server action for the repo-wide pattern: zod-validate input, resolve the caller
 * via `requireUser()`, insert with the USER client so RLS enforces ownership (never the admin
 * client), and return `ActionResult` instead of throwing across the RSC boundary.
 */
export async function createPatient(input: unknown): Promise<ActionResult<Patient>> {
  const parsed = createPatientSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }

  const { user, supabase } = await requireUser();
  const { displayName, timezone, etiology, isDemo } = parsed.data;

  const { data, error } = await supabase
    .from("patients")
    .insert({
      caregiver_id: user.id,
      display_name: displayName,
      timezone,
      etiology,
      is_demo: isDemo ?? false,
    })
    .select()
    .single();

  if (error) {
    return failAction("createPatient failed", error, "Could not save. Please try again.");
  }

  return { data, error: null };
}

"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { ACTIVE_PATIENT_COOKIE } from "@/lib/patients/active";
import { createPatientSchema } from "@/lib/patients/schema";
import type { Tables } from "@/lib/supabase/database.types";

export type Patient = Tables<"patients">;

const setActivePatientSchema = z.object({ patientId: z.uuid() });

/**
 * Remember which owned patient the caregiver is acting on (multi-patient switcher). Verifies the
 * id is a patient the CALLER owns before writing the cookie — RLS would already stop a caregiver
 * loading someone else's data, but this refuses to even persist a non-owned id, so the cookie can
 * never point at a patient outside the caller's roster. HttpOnly + sameSite cookie.
 */
export async function setActivePatient(
  input: unknown,
): Promise<ActionResult<{ patientId: string }>> {
  const parsed = setActivePatientSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: "Invalid patient." };
  }

  const { user, supabase } = await requireUser();
  const { patientId } = parsed.data;

  const { data: owned, error } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .eq("caregiver_id", user.id)
    .maybeSingle();
  if (error) {
    return failAction("setActivePatient lookup", error, "Could not switch patient.");
  }
  if (!owned) {
    return { data: null, error: "That patient is not on your list." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PATIENT_COOKIE, patientId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
  return { data: { patientId }, error: null };
}

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

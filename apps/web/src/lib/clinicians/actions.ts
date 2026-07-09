"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { linkClinicianSchema, unlinkClinicianSchema } from "./schema";

/**
 * Grant a clinician read-only access to a patient's trends. Delegates to the `link_clinician`
 * SECURITY DEFINER function (called on the RLS USER client, never the service-role client): it
 * re-checks that the caller OWNS the patient, resolves the clinician by email against auth.users
 * — which `authenticated` cannot read directly — and refuses self-links. Any failure returns one
 * generic message so the caregiver learns nothing about which emails do/don't have accounts beyond
 * "this didn't work."
 */
export async function linkClinician(input: unknown): Promise<ActionResult<null>> {
  const parsed = linkClinicianSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const { supabase } = await requireUser();
  const { patientId, email } = parsed.data;

  const { error } = await supabase.rpc("link_clinician", {
    p_patient_id: patientId,
    p_clinician_email: email,
  });
  if (error) {
    return failAction(
      "linkClinician",
      error,
      "Could not share access. Check the email belongs to a Keepsake account and that it isn't your own.",
    );
  }

  revalidatePath("/clinicians");
  return { data: null, error: null };
}

/**
 * Revoke a clinician's access. A plain RLS-scoped delete: the policy only lets the patient's
 * caregiver (or the clinician themselves) remove the row, so a non-owner delete simply matches
 * zero rows. No service-role client.
 */
export async function unlinkClinician(input: unknown): Promise<ActionResult<null>> {
  const parsed = unlinkClinicianSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: "Invalid request." };
  }

  const { supabase } = await requireUser();
  const { patientId, clinicianId } = parsed.data;

  const { error } = await supabase
    .from("clinician_patients")
    .delete()
    .eq("patient_id", patientId)
    .eq("clinician_id", clinicianId);
  if (error) {
    return failAction("unlinkClinician", error, "Could not remove access. Please try again.");
  }

  revalidatePath("/clinicians");
  return { data: null, error: null };
}

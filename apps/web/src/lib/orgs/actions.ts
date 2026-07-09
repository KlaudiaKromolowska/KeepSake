"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import {
  addOrgMemberSchema,
  createOrgPatientSchema,
  createOrgSchema,
  removeOrgMemberSchema,
} from "./schema";

/**
 * Create a care-home organization. Delegates to the `create_organization` SECURITY DEFINER function
 * (on the RLS USER client, never service-role): it inserts the org and atomically makes the caller
 * its first admin — the only way to bootstrap membership, since organization_members has no INSERT
 * policy. Returns the new org id so the UI can route to it.
 */
export async function createOrganization(input: unknown): Promise<ActionResult<{ orgId: string }>> {
  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_organization", { p_name: parsed.data.name });
  if (error || !data) {
    return failAction(
      "createOrganization",
      error,
      "Could not create the care home. Please try again.",
    );
  }

  revalidatePath("/orgs");
  return { data: { orgId: data }, error: null };
}

/**
 * Add a colleague to an org's team. Delegates to `add_org_member` (definer): it re-checks the caller
 * is an ADMIN of the org (a staff member or non-member is refused with 42501), resolves the invitee
 * by email against auth.users, and validates the role. One generic error on any failure so the
 * caregiver learns nothing about which emails have accounts.
 */
export async function addOrgMember(input: unknown): Promise<ActionResult<null>> {
  const parsed = addOrgMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const { supabase } = await requireUser();
  const { orgId, email, role } = parsed.data;
  const { error } = await supabase.rpc("add_org_member", {
    p_org_id: orgId,
    p_email: email,
    p_role: role,
  });
  if (error) {
    return failAction(
      "addOrgMember",
      error,
      "Could not add that person. Check the email belongs to a Keepsake account and that you're an admin of this care home.",
    );
  }

  revalidatePath(`/orgs/${orgId}`);
  return { data: null, error: null };
}

/**
 * Remove a member. A plain RLS-scoped delete: the DELETE policy only lets a member remove THEMSELVES
 * or an admin remove anyone in the org, so an unauthorized delete simply matches zero rows. No
 * service-role client.
 */
export async function removeOrgMember(input: unknown): Promise<ActionResult<null>> {
  const parsed = removeOrgMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: "Invalid request." };
  }

  const { supabase } = await requireUser();
  const { orgId, userId } = parsed.data;
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("org_id", orgId)
    .eq("user_id", userId);
  if (error) {
    return failAction("removeOrgMember", error, "Could not remove that person. Please try again.");
  }

  revalidatePath(`/orgs/${orgId}`);
  return { data: null, error: null };
}

/**
 * Create an org-owned patient (no personal caregiver_id). The insert goes through the RLS user
 * client, where `patients_insert_org` enforces that only an ADMIN of the org may create it — a staff
 * member's insert is refused. `caregiver_id` is deliberately omitted (NULL): the ORG owns the row.
 */
export async function createOrgPatient(
  input: unknown,
): Promise<ActionResult<{ patientId: string }>> {
  const parsed = createOrgPatientSchema.safeParse(input);
  if (!parsed.success) {
    return { data: null, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  const { supabase } = await requireUser();
  const { orgId, displayName, timezone, etiology } = parsed.data;
  const { data, error } = await supabase
    .from("patients")
    .insert({ org_id: orgId, display_name: displayName, timezone, etiology })
    .select("id")
    .single();
  if (error || !data) {
    return failAction(
      "createOrgPatient",
      error,
      "Could not add that person. Only an admin can add people.",
    );
  }

  revalidatePath(`/orgs/${orgId}`);
  return { data: { patientId: data.id }, error: null };
}

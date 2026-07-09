import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivePatient } from "@/lib/patients/active";
import type { Database } from "@/lib/supabase/database.types";

/** Read helpers for the care-home (organization) surfaces. Plain server functions (called from Server
 *  Components); every read on the RLS user client, never the service-role client. */

type Db = SupabaseClient<Database>;
export type OrgRole = "staff" | "admin";

export interface MyOrg {
  id: string;
  name: string;
  role: OrgRole;
}

export interface OrgMember {
  userId: string;
  email: string;
  role: OrgRole;
  createdAt: string;
}

/**
 * The organizations the signed-in user belongs to, with their role in each. Two RLS-scoped reads
 * (own memberships, then the orgs they point at) rather than a nested embed, so each read is covered
 * by exactly one policy. RLS already scopes both to the caller; the explicit `user_id` filter keeps
 * this to the caller's memberships as defense-in-depth.
 */
export async function listMyOrgs(supabase: Db, userId: string): Promise<MyOrg[]> {
  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", userId);
  if (error || !memberships || memberships.length === 0) return [];

  const roleByOrg = new Map(memberships.map((m) => [m.org_id, m.role as OrgRole]));
  const { data: orgs, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", [...roleByOrg.keys()])
    .order("name", { ascending: true });
  if (orgErr || !orgs) return [];

  return orgs.map((o) => ({ id: o.id, name: o.name, role: roleByOrg.get(o.id) ?? "staff" }));
}

/**
 * An org's team roster by email. Uses the `list_org_members` SECURITY DEFINER function (membership
 * re-checked inside) so members can see each other's email — auth.users is not otherwise readable by
 * `authenticated`. Returns [] for a non-member (the RPC raises, which we swallow to an empty roster).
 */
export async function listOrgMembers(supabase: Db, orgId: string): Promise<OrgMember[]> {
  const { data, error } = await supabase.rpc("list_org_members", { p_org_id: orgId });
  if (error || !data) return [];
  return data.map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role as OrgRole,
    createdAt: row.created_at,
  }));
}

/** The patients owned by an org — RLS (patients_select_org) scopes this to members of the org. */
export async function listOrgPatients(supabase: Db, orgId: string): Promise<ActivePatient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("id, display_name, timezone, etiology")
    .eq("org_id", orgId)
    .order("display_name", { ascending: true });
  if (error || !data) return [];
  return data.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    timezone: p.timezone,
    etiology: p.etiology,
  }));
}

import { z } from "zod";
import { ETIOLOGY_VALUES } from "@/lib/patients/schema";

/** Care-home tenancy (PLAN §12 V3). Every input crossing a server-action boundary is validated here
 *  before it ever reaches an RPC or the RLS user client. */

/** The two minimal roles — mirror the `role` CHECK on public.organization_members. */
export const ORG_ROLE_VALUES = ["staff", "admin"] as const;

/** Create a new care-home organization (caller becomes its first admin). */
export const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(200),
});

/** Admin adds a colleague to an org by their Keepsake account email. */
export const addOrgMemberSchema = z.object({
  orgId: z.uuid(),
  email: z.email().max(320),
  role: z.enum(ORG_ROLE_VALUES),
});

/** Remove a member (an admin removes anyone; a member removes themselves). */
export const removeOrgMemberSchema = z.object({
  orgId: z.uuid(),
  userId: z.uuid(),
});

const IANA_TIMEZONES = new Set(Intl.supportedValuesOf("timeZone"));

/** Admin creates an org-owned patient (no personal caregiver_id — the org owns it). */
export const createOrgPatientSchema = z.object({
  orgId: z.uuid(),
  displayName: z.string().trim().min(1).max(100),
  timezone: z.string().refine((tz) => IANA_TIMEZONES.has(tz), {
    message: "Must be a valid IANA timezone name",
  }),
  etiology: z.enum(ETIOLOGY_VALUES),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type AddOrgMemberInput = z.infer<typeof addOrgMemberSchema>;
export type RemoveOrgMemberInput = z.infer<typeof removeOrgMemberSchema>;
export type CreateOrgPatientInput = z.infer<typeof createOrgPatientSchema>;

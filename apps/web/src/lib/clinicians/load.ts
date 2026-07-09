import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivePatient } from "@/lib/patients/active";
import type { Database } from "@/lib/supabase/database.types";

/** Read helpers for the clinician-sharing surfaces. Plain server functions (called from Server
 *  Components), every read on the RLS user client. */

type Db = SupabaseClient<Database>;

export interface CareTeamMember {
  clinicianId: string;
  email: string;
  createdAt: string;
}

/**
 * Caregiver-side: who a patient's read-only view has been shared with, by email. Uses the
 * `list_clinicians_for_patient` definer function (ownership re-checked inside) so the caregiver can
 * see the clinician's email — auth.users is not otherwise readable by `authenticated`.
 */
export async function listCareTeam(supabase: Db, patientId: string): Promise<CareTeamMember[]> {
  const { data, error } = await supabase.rpc("list_clinicians_for_patient", {
    p_patient_id: patientId,
  });
  if (error || !data) return [];
  return data.map((row) => ({
    clinicianId: row.clinician_id,
    email: row.email,
    createdAt: row.created_at,
  }));
}

/**
 * Clinician-side: the patients whose read-only view has been shared with this user. Two RLS-scoped
 * reads (grants they own, then the patients those grants point at) rather than a nested embed, so
 * each read is trivially covered by exactly one policy.
 */
export async function listClinicianPatients(
  supabase: Db,
  userId: string,
): Promise<ActivePatient[]> {
  const { data: links, error: linkErr } = await supabase
    .from("clinician_patients")
    .select("patient_id")
    .eq("clinician_id", userId);
  if (linkErr || !links || links.length === 0) return [];

  const { data: patients, error: patientErr } = await supabase
    .from("patients")
    .select("id, display_name, timezone, etiology")
    .in(
      "id",
      links.map((l) => l.patient_id),
    )
    .order("display_name", { ascending: true });
  if (patientErr || !patients) return [];

  return patients.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    timezone: p.timezone,
    etiology: p.etiology,
  }));
}

/**
 * Clinician-side: load ONE shared patient by id for the read-only trend routes. RLS returns the row
 * only when the caller is a linked clinician (or the owner) — a clinician asking for an unlinked
 * patient gets null, which the route turns into a 404.
 */
export async function loadClinicianPatient(
  supabase: Db,
  patientId: string,
): Promise<ActivePatient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("id, display_name, timezone, etiology")
    .eq("id", patientId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    displayName: data.display_name,
    timezone: data.timezone,
    etiology: data.etiology,
  };
}

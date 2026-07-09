import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Active-patient resolution for the multi-patient caregiver (PLAN §12 V1). A caregiver can own more
 * than one patient (patients.caregiver_id has always been a plain FK, so the schema already allowed
 * this — only the app assumed one); the "current" patient is remembered in a cookie and threaded
 * through every caregiver surface (dashboard, session entry, /targets, /progress, /trends).
 *
 * Every query here filters `caregiver_id = userId` EXPLICITLY. RLS already scopes reads to the
 * caller, but a caregiver who is ALSO a linked clinician (clinician_patients) would otherwise have
 * the clinician-visible patients bleed into their owned roster — the explicit owner filter keeps
 * the caregiver surfaces to owned patients only, defense-in-depth on top of RLS.
 */

export const ACTIVE_PATIENT_COOKIE = "ks_active_patient";

export interface ActivePatient {
  id: string;
  displayName: string;
  timezone: string;
  etiology: Database["public"]["Enums"]["etiology"];
}

type Db = SupabaseClient<Database>;

/** Every patient this caregiver owns, oldest first — the switcher roster. */
export async function listOwnedPatients(supabase: Db, userId: string): Promise<ActivePatient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("id, display_name, timezone, etiology")
    .eq("caregiver_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    timezone: p.timezone,
    etiology: p.etiology,
  }));
}

/**
 * The patient the caregiver is currently acting on: the cookie-named one if it is still an owned
 * patient, otherwise the oldest owned patient (stable default), otherwise null (no patients yet).
 * A stale/forged cookie can never widen access — it can only ever select among the caller's OWN
 * patients, and falls back safely when it names anything else.
 */
export async function resolveActivePatient(
  supabase: Db,
  userId: string,
): Promise<ActivePatient | null> {
  const patients = await listOwnedPatients(supabase, userId);
  if (patients.length === 0) return null;

  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_PATIENT_COOKIE)?.value;
  return patients.find((p) => p.id === wanted) ?? patients[0];
}

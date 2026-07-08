import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { PRACTICABLE_STATUSES, type QueueTarget } from "./queue";

/**
 * Server-side loader for the multi-target queue: the caregiver's patient plus every practicable
 * target with its persisted schedule state, mapped to the pure `QueueTarget` shape. One query for
 * all four consumers (dashboard, session entry, /schedule, /targets) so the roster never drifts
 * between surfaces. RLS scopes every read to the caller's own patient. Returns `null` when there is
 * no patient yet; `targets: []` when the patient has no practicable target.
 */

export interface QueuePatient {
  id: string;
  timezone: string;
  etiology: Database["public"]["Enums"]["etiology"];
}

export interface LoadedQueue {
  patient: QueuePatient;
  targets: QueueTarget[];
}

/** target_state is embedded 1:1; PostgREST returns it as an object (or null when no row yet). */
interface TargetRowWithState {
  id: string;
  question: string;
  status: string;
  created_at: string;
  target_state: {
    schedule_mode: string | null;
    next_due_at: string | null;
    mastered_at: string | null;
  } | null;
}

export async function loadQueue(supabase: SupabaseClient<Database>): Promise<LoadedQueue | null> {
  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, timezone, etiology")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientErr || !patient) return null;

  const { data, error: targetsErr } = await supabase
    .from("targets")
    .select(
      "id, question, status, created_at, target_state(schedule_mode, next_due_at, mastered_at)",
    )
    .eq("patient_id", patient.id)
    .in("status", [...PRACTICABLE_STATUSES])
    .order("created_at", { ascending: true });
  if (targetsErr) return { patient, targets: [] };

  // Embedded 1:1 relation — cast to the concrete shape (PostgREST's generic embed inference is
  // looser than the column list we asked for).
  const rows = (data ?? []) as unknown as TargetRowWithState[];
  const targets: QueueTarget[] = rows.map((r) => ({
    id: r.id,
    question: r.question,
    status: r.status,
    createdAt: r.created_at,
    scheduleMode: r.target_state?.schedule_mode ?? null,
    nextDueAt: r.target_state?.next_due_at ?? null,
    masteredAt: r.target_state?.mastered_at ?? null,
  }));

  return { patient, targets };
}

import type { DebriefAggregate } from "@keepsake/core/prompts/debrief";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

/** Minimal trial shape the pure mapper needs — matches a `trials` row select. */
export interface DebriefTrialRow {
  interval_sec: number;
  outcome: string;
}

/** Non-array JSON object → a plain record; anything else → {}. Mirrors session/actions.ts asRecord. */
function asRecord(json: Json | null | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

/**
 * Pure mapping from the session's `summary` JSON + its trial rows into the compact,
 * PII-minimal aggregate the debrief prompt consumes. No ids, emails, or raw row dumps — only
 * counts, the rung sequence, override annotations, the caregiver's own note, and the patient's
 * display name.
 */
export function toDebriefAggregate(
  summary: Json | null | undefined,
  trials: DebriefTrialRow[],
  patientDisplayName: string,
  locale = "en",
): DebriefAggregate {
  const rec = asRecord(summary);
  const stats =
    rec.stats && typeof rec.stats === "object" ? (rec.stats as Record<string, unknown>) : {};
  const annotations = Array.isArray(rec.annotations) ? rec.annotations : [];
  const overrideAnnotations = annotations
    .filter(
      (a): a is { kind: string; fromSec: number; toSec: number } =>
        typeof a === "object" &&
        a !== null &&
        (a as { kind?: unknown }).kind === "interval_override",
    )
    .map((a) => ({ fromSec: a.fromSec, toSec: a.toSec }));
  const count = (outcome: string) => trials.filter((t) => t.outcome === outcome).length;

  return {
    patientDisplayName,
    locale,
    trialCount: trials.length,
    recalls: count("recall"),
    misses: count("miss"),
    unclears: count("unclear"),
    rungSequenceSec: trials.map((t) => t.interval_sec),
    overrideAnnotations,
    note: typeof rec.note === "string" ? rec.note : null,
    mastered: stats.endReason === "mastered",
    rescopeRequired: stats.rescopeRequired === true,
  };
}

export type FetchDebriefAggregateError = "not_found" | "not_ended" | "db_error";
export type FetchDebriefAggregateResult =
  | { data: DebriefAggregate; error: null }
  | { data: null; error: FetchDebriefAggregateError };

/**
 * Fetches the session (verifying it belongs to the caller — enforced by RLS on the passed-in
 * user-scoped client, not re-checked here) and its trials, then maps them to the debrief
 * aggregate. Ends closed: any read error is `db_error`, an unended session is `not_ended`, a
 * missing/foreign session is `not_found` (RLS makes the two indistinguishable, which is correct
 * — never leak which one it was).
 */
export async function fetchDebriefAggregate(
  supabase: SupabaseClient<Database>,
  sessionId: string,
): Promise<FetchDebriefAggregateResult> {
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("ended_at, summary, patient_id")
    .eq("id", sessionId)
    .single();
  if (sessionErr || !session) return { data: null, error: "not_found" };
  if (!session.ended_at) return { data: null, error: "not_ended" };

  const { data: trials, error: trialsErr } = await supabase
    .from("trials")
    .select("interval_sec, outcome")
    .eq("session_id", sessionId)
    .order("at", { ascending: true });
  if (trialsErr) {
    console.error("fetchDebriefAggregate: trials", trialsErr);
    return { data: null, error: "db_error" };
  }

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("display_name")
    .eq("id", session.patient_id)
    .single();
  if (patientErr || !patient) {
    console.error("fetchDebriefAggregate: patient", patientErr);
    return { data: null, error: "db_error" };
  }

  return {
    data: toDebriefAggregate(session.summary, trials ?? [], patient.display_name),
    error: null,
  };
}

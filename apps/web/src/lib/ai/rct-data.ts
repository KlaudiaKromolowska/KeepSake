/**
 * Pure mapping from patient-scoped DB rows to the RCT analytics inputs: the static prompt CONTEXT
 * (patient identity + config + target roster) and the normalized RctAnalyticsData the tools
 * aggregate over. Shared by the /api/rct-report route (rows read via the RLS user client) and the
 * fixture recorder (rows read via the service-role admin client) so the two never drift. No I/O
 * here — the caller does the reads; this only transforms rows. Data minimization: ids never leave
 * this layer (they become 1-based indices), and only display_name + target text reach the context.
 */

import { type RctContext, serializeRctContext } from "@keepsake/core/prompts/rct-report";
import type { Etiology } from "@keepsake/core/sr";
import { srDefaultsForPatient } from "@/lib/sr/config";
import type {
  AnalyticsSession,
  AnalyticsTargetState,
  Outcome,
  RctAnalyticsData,
} from "./rct-tools";

export interface RctPatientRow {
  display_name: string;
  etiology: string;
  timezone: string;
}
export interface RctTargetRow {
  id: string;
  question: string;
  answer: string;
  status: string;
  candidacy: string;
}
export interface RctStateRow {
  target_id: string;
  last_success_interval_sec: number | null;
  start_streak: number;
  bad_sessions: number;
  session_count: number;
  mastered_at: string | null;
  schedule_mode: string | null;
  between_session_gap_days: number | null;
  booster_step: number | null;
  next_due_at: string | null;
}
export interface RctSessionRow {
  id: string;
  started_at: string;
  affect_pre: string | null;
  affect_post: string | null;
}
export interface RctTrialRow {
  session_id: string;
  target_id: string;
  interval_sec: number;
  outcome: string;
  corrected: boolean;
  is_screening: boolean;
}

export interface RctRawInputs {
  patient: RctPatientRow;
  targets: RctTargetRow[];
  states: RctStateRow[];
  sessions: RctSessionRow[]; // ordered by started_at ascending
  trials: RctTrialRow[]; // ordered by `at` ascending
}

/** ISO instant → YYYY-MM-DD in the patient's timezone (calendar-day rules resolve there). */
export function dayInTz(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const asOutcome = (o: string): Outcome => (o === "miss" || o === "unclear" ? o : "recall");
const asAffect = (a: string | null): "content" | "unsettled" | null =>
  a === "content" || a === "unsettled" ? a : null;

/** Transform patient-scoped rows into the report CONTEXT string + the tools' analytics dataset. */
export function buildRctInputs(raw: RctRawInputs): {
  context: string;
  data: RctAnalyticsData;
} {
  const tz = raw.patient.timezone;
  const targetIndexById = new Map(raw.targets.map((t, i) => [t.id, i + 1]));
  const sessionIndexById = new Map(raw.sessions.map((s, i) => [s.id, i + 1]));
  const stateByTarget = new Map(raw.states.map((s) => [s.target_id, s]));

  const roster: RctContext["targets"] = raw.targets.map((t) => ({
    question: t.question,
    answer: t.answer,
    status: t.status,
    candidacy: t.candidacy,
  }));

  const targets: AnalyticsTargetState[] = raw.targets.map((t, i) => {
    const st = stateByTarget.get(t.id);
    return {
      index: i + 1,
      lastSuccessIntervalSec: st?.last_success_interval_sec ?? null,
      startStreak: st?.start_streak ?? 0,
      badSessions: st?.bad_sessions ?? 0,
      sessionCount: st?.session_count ?? 0,
      mastered: st?.mastered_at != null,
      scheduleMode: st?.schedule_mode ?? null,
      betweenSessionGapDays: st?.between_session_gap_days ?? null,
      boosterStep: st?.booster_step ?? null,
      nextDueAt: st?.next_due_at ? dayInTz(st.next_due_at, tz) : null,
    };
  });

  const sessions: AnalyticsSession[] = raw.sessions.map((s, i) => ({
    index: i + 1,
    date: dayInTz(s.started_at, tz),
    affectPre: asAffect(s.affect_pre),
    affectPost: asAffect(s.affect_post),
  }));

  const trials = raw.trials.flatMap((tr) => {
    const sessionIndex = sessionIndexById.get(tr.session_id);
    const targetIndex = targetIndexById.get(tr.target_id);
    if (sessionIndex === undefined || targetIndex === undefined) return [];
    return [
      {
        sessionIndex,
        targetIndex,
        intervalSec: tr.interval_sec,
        outcome: asOutcome(tr.outcome),
        corrected: tr.corrected,
        isScreening: tr.is_screening,
      },
    ];
  });

  const { config } = srDefaultsForPatient(raw.patient.etiology as Etiology);
  const context = serializeRctContext({
    patientName: raw.patient.display_name,
    etiology: raw.patient.etiology,
    config: {
      baseIntervalSec: config.baseIntervalSec,
      maxIntervalSec: config.maxIntervalSec,
      growthFactor: config.growthFactor,
      masteryStreak: config.masteryStreak,
      firstGapDays: config.firstGapDays,
      boosterCadenceDays: config.boosterCadenceDays,
    },
    targets: roster,
  });

  return { context, data: { sessions, trials, targets } };
}

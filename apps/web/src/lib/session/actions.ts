"use server";

import {
  afterCeilingHandoff,
  afterMastery,
  canResume,
  onBoosterOutcome,
  onSessionStartOutcome,
  resolvedStartProbeOutcome,
  resumeSession,
  type ScheduleState,
  type SessionState,
  startSession,
  type TargetProgress,
} from "@keepsake/core/sr";
import type { z } from "zod";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { srDefaultsForPatient } from "@/lib/sr/config";
import type { Json, Tables, TablesInsert } from "@/lib/supabase/database.types";
import { PRACTICABLE_STATUSES } from "@/lib/targets/queue";
import { aliasesFromJson } from "./grade-schema";
import {
  annotateSessionInputSchema,
  endSessionInputSchema,
  recordTrialInputSchema,
  saveSessionAffectInputSchema,
  saveSessionNoteInputSchema,
  sessionStateSchema,
  startSessionInputSchema,
} from "./schema";

export interface SessionTarget {
  id: string;
  question: string;
  answer: string;
  imageUrl: string | null;
  /** Accept-aliases from the wizard — the speech assist matches against these too. */
  acceptedVariants: readonly string[];
}
export interface StartSessionResult {
  sessionId: string;
  state: SessionState;
  target: SessionTarget;
  config: ReturnType<typeof srDefaultsForPatient>["config"];
  resumed: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * Input/snapshot failed zod validation — a silent drop here previously meant a session just
 * stopped persisting with no server-side trace. Log field paths + issue codes only (never the
 * rejected values — GDPR Art. 9 data minimization), then return the user-facing message join.
 */
function zerr(issues: z.ZodIssue[]): string {
  console.error(
    "session schema validation failed",
    issues.map((i) => ({ path: i.path.join("."), code: i.code })),
  );
  return issues.map((i) => i.message).join("; ");
}

/** Non-array JSON object → a shallow-cloneable record; anything else → {}. Never throws. */
function asRecord(json: Json | null | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? { ...(json as Record<string, unknown>) }
    : {};
}

/** A DB summary object is client-derived JSON — cast to the column type at the write boundary. */
const toJson = (o: Record<string, unknown>) => o as unknown as Json;

/** target_state row → engine `TargetProgress`; a missing row is a fresh (zeroed) target. */
function rowToProgress(row: Tables<"target_state"> | null): TargetProgress {
  if (!row) {
    return {
      lastSuccessSec: null,
      startStreak: 0,
      lastStartSuccessDay: null,
      badSessions: 0,
      mastered: false,
      sessionCount: 0,
    };
  }
  return {
    lastSuccessSec: row.last_success_interval_sec,
    startStreak: row.start_streak,
    lastStartSuccessDay: row.last_start_success_day,
    badSessions: row.bad_sessions,
    mastered: row.mastered_at !== null,
    sessionCount: row.session_count,
  };
}

export async function startSessionAction(
  input: unknown,
): Promise<ActionResult<StartSessionResult>> {
  const parsed = startSessionInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { targetId } = parsed.data;

  const { supabase } = await requireUser();

  const { data: target, error: targetErr } = await supabase
    .from("targets")
    .select("id, question, answer, image_url, status, patient_id, accepted_variants")
    .eq("id", targetId)
    .single();
  if (targetErr || !target) {
    return failAction("startSession: target lookup", targetErr, "Target not found.");
  }
  // Practicable = acquiring ("active") OR in the post-mastery booster loop ("mastered"/
  // "maintenance"). A mastered target must be startable so its boosters can run in parallel (V2
  // multi-target); only "draft"/"paused"/"retired" are turned away here.
  if (!(PRACTICABLE_STATUSES as readonly string[]).includes(target.status)) {
    return { data: null, error: "This target is not ready to practice." };
  }

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("timezone, etiology")
    .eq("id", target.patient_id)
    .single();
  if (patientErr || !patient) {
    return failAction("startSession: patient lookup", patientErr, "Could not start the session.");
  }

  const { config } = srDefaultsForPatient(patient.etiology);
  const now = Date.now();
  const sessionTarget: SessionTarget = {
    id: target.id,
    question: target.question,
    answer: target.answer,
    imageUrl: target.image_url,
    acceptedVariants: aliasesFromJson(target.accepted_variants),
  };

  const { data: open, error: openErr } = await supabase
    .from("sessions")
    .select("id, summary")
    .eq("patient_id", target.patient_id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Fail closed: a transient read error must not fall through to a second session insert.
  if (openErr)
    return failAction("startSession: open lookup", openErr, "Could not start the session.");

  if (open) {
    const summary = asRecord(open.summary);
    const snap = sessionStateSchema.safeParse(summary.snapshot);
    // Resume ONLY the requested target's own open session (sessions has no target_id column;
    // the target is pinned in summary.targetId). A mismatched/legacy targetId → graceful discard.
    if (
      summary.targetId === targetId &&
      snap.success &&
      canResume(snap.data as SessionState, now)
    ) {
      const state = resumeSession(snap.data as SessionState, now, config);
      if (state) {
        const { error } = await supabase
          .from("sessions")
          .update({ summary: toJson({ ...summary, snapshot: state }) })
          .eq("id", open.id);
        if (error)
          return failAction("startSession: resume", error, "Could not resume the session.");
        return {
          data: { sessionId: open.id, state, target: sessionTarget, config, resumed: true },
          error: null,
        };
      }
    }
    // Not resumable (different day or corrupt snapshot) → close gracefully, no penalty.
    const { error } = await supabase
      .from("sessions")
      .update({ ended_at: iso(now), summary: toJson({ ...summary, discarded: true }) })
      .eq("id", open.id);
    if (error)
      return failAction("startSession: discard stale", error, "Could not start the session.");
  }

  const { data: stateRow, error: stateReadErr } = await supabase
    .from("target_state")
    .select("*")
    .eq("target_id", targetId)
    .maybeSingle();
  // Fail closed: a transient read error must not zero-init progress and restart from base rung.
  if (stateReadErr) {
    return failAction(
      "startSession: target_state read",
      stateReadErr,
      "Could not start the session.",
    );
  }
  const state = startSession(
    rowToProgress(stateRow),
    { at: now, timeZone: patient.timezone },
    config,
  );

  const { data: inserted, error: insertErr } = await supabase
    .from("sessions")
    .insert({
      patient_id: target.patient_id,
      started_at: iso(now),
      summary: toJson({ targetId, snapshot: state, startProbe: state.isStartProbe }),
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return failAction("startSession: insert", insertErr, "Could not start the session.");
  }

  return {
    data: { sessionId: inserted.id, state, target: sessionTarget, config, resumed: false },
    error: null,
  };
}

export async function recordTrialAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = recordTrialInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { sessionId, targetId, trialId, trial, snapshot } = parsed.data;

  const { supabase } = await requireUser();

  // Idempotent replay (offline queue, V3 — "never lose a trial"): `trialId` is client-generated
  // and carried unchanged through a queued retry, so upserting on it with `ignoreDuplicates`
  // makes a replay of an already-landed write a no-op instead of a second trial row.
  const { error: trialErr } = await supabase.from("trials").upsert(
    {
      id: trialId,
      session_id: sessionId,
      target_id: targetId,
      interval_sec: trial.intervalSec,
      outcome: trial.outcome,
      is_screening: trial.isScreening,
      corrected: trial.corrected,
      at: iso(trial.at),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (trialErr) return failAction("recordTrial: insert", trialErr, "Could not save that trial.");

  const { data: row, error: readErr } = await supabase
    .from("sessions")
    .select("summary")
    .eq("id", sessionId)
    .single();
  if (readErr || !row)
    return failAction("recordTrial: read", readErr, "Could not save that trial.");

  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ summary: toJson({ ...asRecord(row.summary), snapshot }) })
    .eq("id", sessionId);
  if (updateErr) return failAction("recordTrial: update", updateErr, "Could not save that trial.");

  return { data: null, error: null };
}

type ActionSupabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/**
 * The fully-precomputed target_state/targets writes an end-session commit needs. Stored in the
 * session summary at the single commit point (the `sessions` close) so a retry after a partial
 * failure re-applies the SAME values — never recomputes schedule growth from an already-grown gap.
 */
interface AppliedEndState {
  appliedSchedule: {
    schedule_mode: string;
    between_session_gap_days: number;
    booster_step: number;
    next_due_at: string;
  } | null;
  appliedProgress: {
    last_success_interval_sec: number | null;
    start_streak: number;
    last_start_success_day: string | null;
    bad_sessions: number;
    session_count: number;
  };
  appliedMasteredAt: string | null;
  appliedTargetStatus: "mastered" | null;
}

/** Step 3 of endSession: write target_state (+ targets.status) FROM stored applied values only. */
async function applyEndState(
  supabase: ActionSupabase,
  targetId: string,
  applied: AppliedEndState,
): Promise<ActionResult<null>> {
  const payload: TablesInsert<"target_state"> = {
    target_id: targetId,
    ...applied.appliedProgress,
    mastered_at: applied.appliedMasteredAt,
    ...(applied.appliedSchedule ?? {}),
  };
  const { error: stateErr } = await supabase
    .from("target_state")
    .upsert(payload, { onConflict: "target_id" });
  if (stateErr)
    return failAction("endSession: target_state", stateErr, "Could not close the session.");

  if (applied.appliedTargetStatus) {
    const { error: statusErr } = await supabase
      .from("targets")
      .update({ status: applied.appliedTargetStatus })
      .eq("id", targetId);
    if (statusErr)
      return failAction("endSession: status", statusErr, "Could not close the session.");
  }
  return { data: null, error: null };
}

export async function endSessionAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = endSessionInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { sessionId, targetId, snapshot } = parsed.data;

  if (snapshot.phase !== "ended") {
    return { data: null, error: "The session is not finished yet." };
  }

  const { supabase } = await requireUser();
  const at = Date.now();

  const { data: sessionRow, error: sessionErr } = await supabase
    .from("sessions")
    .select("ended_at, summary, patient_id")
    .eq("id", sessionId)
    .single();
  if (sessionErr || !sessionRow) {
    return failAction("endSession: read", sessionErr, "Could not close the session.");
  }

  const summary = asRecord(sessionRow.summary);

  // Idempotent heal: the session was already closed (the single commit point). If the applied
  // values were stored, re-run step 3 from them (a prior partial failure left target_state
  // unwritten); a retry re-applies the SAME values instead of re-growing the schedule. A legacy
  // row without them → the old plain no-op.
  if (sessionRow.ended_at) {
    if (!("appliedSchedule" in summary)) return { data: null, error: null };
    return applyEndState(supabase, targetId, {
      appliedSchedule: (summary.appliedSchedule as AppliedEndState["appliedSchedule"]) ?? null,
      appliedProgress: summary.appliedProgress as AppliedEndState["appliedProgress"],
      appliedMasteredAt: (summary.appliedMasteredAt as string | null) ?? null,
      appliedTargetStatus: (summary.appliedTargetStatus as "mastered" | null) ?? null,
    });
  }

  const startProbe = summary.startProbe === true;

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("etiology")
    .eq("id", sessionRow.patient_id)
    .single();
  if (patientErr || !patient) {
    return failAction("endSession: patient", patientErr, "Could not close the session.");
  }
  const { config } = srDefaultsForPatient(patient.etiology);

  const { data: stateRow, error: stateReadErr } = await supabase
    .from("target_state")
    .select("*")
    .eq("target_id", targetId)
    .maybeSingle();
  // Fail closed: a transient read error must not re-initialise a schedule from a zeroed target.
  if (stateReadErr)
    return failAction(
      "endSession: target_state read",
      stateReadErr,
      "Could not close the session.",
    );

  const existing: ScheduleState | null = stateRow?.schedule_mode
    ? {
        mode: stateRow.schedule_mode as ScheduleState["mode"],
        gapDays: stateRow.between_session_gap_days ?? 0,
        boosterStep: stateRow.booster_step ?? 0,
        nextDueAt: stateRow.next_due_at ? Date.parse(stateRow.next_due_at) : at,
      }
    : null;

  let sched = existing;
  if (snapshot.endReason === "mastered") {
    sched = afterMastery(at, config); // one-time handoff; between-mode result is discarded (§5)
  } else {
    // Resolve, not just read, the start probe's outcome: a terminal double-unclear is recorded as
    // `{ outcome: "unclear", corrected: true }` (PLAN §4.2 v4 — two consecutive unclears = a
    // confirmed miss), which `resolvedStartProbeOutcome` collapses to `"miss"` so the schedule
    // actually shrinks instead of silently no-op'ing on the raw `"unclear"` reading.
    const resolvedOutcome = startProbe ? resolvedStartProbeOutcome(snapshot.trials) : null;
    if (existing && resolvedOutcome) {
      // Dispatch by the persisted mode: a mastered target runs booster sessions whose cadence
      // grows via `onBoosterOutcome`; a pre-mastery target updates its between-session gap.
      sched =
        existing.mode === "booster"
          ? onBoosterOutcome(existing, resolvedOutcome, at, config).state
          : onSessionStartOutcome(existing, resolvedOutcome, at, config).state;
    }
    if (!existing && snapshot.endReason === "ceiling") sched = afterCeilingHandoff(at, config);
  }

  const { progress } = snapshot;
  const count = (o: SessionState["trials"][number]["outcome"]) =>
    snapshot.trials.filter((t) => t.outcome === o).length;

  // Everything step 3 needs, precomputed from the pre-state row so the heal path can replay it.
  const applied: AppliedEndState = {
    appliedSchedule: sched
      ? {
          schedule_mode: sched.mode,
          between_session_gap_days: sched.gapDays,
          booster_step: sched.boosterStep,
          next_due_at: iso(sched.nextDueAt),
        }
      : null,
    appliedProgress: {
      last_success_interval_sec: progress.lastSuccessSec,
      start_streak: progress.startStreak,
      last_start_success_day: progress.lastStartSuccessDay,
      bad_sessions: progress.badSessions,
      session_count: progress.sessionCount,
    },
    appliedMasteredAt:
      progress.mastered && !stateRow?.mastered_at ? iso(at) : (stateRow?.mastered_at ?? null),
    appliedTargetStatus: progress.mastered ? "mastered" : null,
  };

  // Step 2 — the single commit point. Close the session and store the applied bundle atomically
  // BEFORE touching target_state, so a failure past here retries into the heal path above.
  const { error: closeErr } = await supabase
    .from("sessions")
    .update({
      ended_at: iso(at),
      summary: toJson({
        ...summary,
        snapshot,
        stats: {
          recalls: count("recall"),
          misses: count("miss"),
          unclears: count("unclear"),
          endReason: snapshot.endReason,
          rescopeRequired: snapshot.rescopeRequired,
        },
        ...applied,
      }),
    })
    .eq("id", sessionId);
  if (closeErr) return failAction("endSession: close", closeErr, "Could not close the session.");

  return applyEndState(supabase, targetId, applied);
}

/**
 * Two-tap patient affect (5.4). Best-effort by design: the columns are nullable (null = skipped)
 * and the kiosk never blocks the session flow on this save.
 */
export async function saveSessionAffectAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = saveSessionAffectInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { sessionId, point, affect } = parsed.data;

  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("sessions")
    .update(point === "pre" ? { affect_pre: affect } : { affect_post: affect })
    .eq("id", sessionId);
  if (error) return failAction("saveSessionAffect: update", error, "Couldn't save that just now.");
  return { data: null, error: null };
}

export async function saveSessionNoteAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = saveSessionNoteInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { sessionId, note } = parsed.data;

  const { supabase } = await requireUser();

  const { data: row, error: readErr } = await supabase
    .from("sessions")
    .select("summary")
    .eq("id", sessionId)
    .single();
  if (readErr || !row)
    return failAction("saveSessionNote: read", readErr, "Could not save the note.");

  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ summary: toJson({ ...asRecord(row.summary), note }) })
    .eq("id", sessionId);
  if (updateErr)
    return failAction("saveSessionNote: update", updateErr, "Could not save the note.");

  return { data: null, error: null };
}

export async function annotateSessionAction(input: unknown): Promise<ActionResult<null>> {
  const parsed = annotateSessionInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { sessionId, ...entry } = parsed.data;

  const { supabase } = await requireUser();

  const { data: row, error: readErr } = await supabase
    .from("sessions")
    .select("summary")
    .eq("id", sessionId)
    .single();
  if (readErr || !row)
    return failAction("annotateSession: read", readErr, "Could not save the annotation.");

  const summary = asRecord(row.summary);
  const annotations = Array.isArray(summary.annotations) ? summary.annotations : [];
  const { error: updateErr } = await supabase
    .from("sessions")
    .update({ summary: toJson({ ...summary, annotations: [...annotations, entry] }) })
    .eq("id", sessionId);
  if (updateErr)
    return failAction("annotateSession: update", updateErr, "Could not save the annotation.");

  return { data: null, error: null };
}

"use server";

import {
  afterCeilingHandoff,
  afterMastery,
  canResume,
  defaultsForEtiology,
  onSessionStartOutcome,
  resumeSession,
  type ScheduleState,
  type SessionState,
  startSession,
  type TargetProgress,
} from "@keepsake/core/sr";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import type { Json, Tables } from "@/lib/supabase/database.types";
import {
  annotateSessionInputSchema,
  endSessionInputSchema,
  recordTrialInputSchema,
  saveSessionNoteInputSchema,
  sessionStateSchema,
  startSessionInputSchema,
} from "./schema";

export interface SessionTarget {
  id: string;
  question: string;
  answer: string;
  imageUrl: string | null;
}
export interface StartSessionResult {
  sessionId: string;
  state: SessionState;
  target: SessionTarget;
  config: ReturnType<typeof defaultsForEtiology>["config"];
  resumed: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();
const zerr = (issues: { message: string }[]) => issues.map((i) => i.message).join("; ");

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
    .select("id, question, answer, image_url, status, patient_id")
    .eq("id", targetId)
    .single();
  if (targetErr || !target) {
    return failAction("startSession: target lookup", targetErr, "Target not found.");
  }
  if (target.status !== "active" && target.status !== "maintenance") {
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

  const { config } = defaultsForEtiology(patient.etiology);
  const now = Date.now();
  const sessionTarget: SessionTarget = {
    id: target.id,
    question: target.question,
    answer: target.answer,
    imageUrl: target.image_url,
  };

  const { data: open } = await supabase
    .from("sessions")
    .select("id, summary")
    .eq("patient_id", target.patient_id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open) {
    const summary = asRecord(open.summary);
    const snap = sessionStateSchema.safeParse(summary.snapshot);
    if (snap.success && canResume(snap.data as SessionState, now)) {
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

  const { data: stateRow } = await supabase
    .from("target_state")
    .select("*")
    .eq("target_id", targetId)
    .maybeSingle();
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
      summary: toJson({ snapshot: state, startProbe: state.isStartProbe }),
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
  const { sessionId, targetId, trial, snapshot } = parsed.data;

  const { supabase } = await requireUser();

  const { error: trialErr } = await supabase.from("trials").insert({
    session_id: sessionId,
    target_id: targetId,
    interval_sec: trial.intervalSec,
    outcome: trial.outcome,
    is_screening: trial.isScreening,
    corrected: trial.corrected,
    at: iso(trial.at),
  });
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
  if (sessionRow.ended_at) return { data: null, error: null }; // idempotent no-op

  const summary = asRecord(sessionRow.summary);
  const startProbe = summary.startProbe === true;

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("etiology")
    .eq("id", sessionRow.patient_id)
    .single();
  if (patientErr || !patient) {
    return failAction("endSession: patient", patientErr, "Could not close the session.");
  }
  const { config } = defaultsForEtiology(patient.etiology);

  const { data: stateRow } = await supabase
    .from("target_state")
    .select("*")
    .eq("target_id", targetId)
    .maybeSingle();

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
    sched = afterMastery(at, config); // between-mode result is discarded per the §5 contract
  } else {
    if (existing && startProbe && snapshot.trials.length > 0) {
      sched = onSessionStartOutcome(existing, snapshot.trials[0].outcome, at, config).state;
    }
    if (!existing && snapshot.endReason === "ceiling") sched = afterCeilingHandoff(at, config);
  }

  const { progress } = snapshot;
  const masteredAt =
    progress.mastered && !stateRow?.mastered_at ? iso(at) : (stateRow?.mastered_at ?? null);

  const stateUpdate: Record<string, unknown> = {
    target_id: targetId,
    last_success_interval_sec: progress.lastSuccessSec,
    start_streak: progress.startStreak,
    last_start_success_day: progress.lastStartSuccessDay,
    bad_sessions: progress.badSessions,
    session_count: progress.sessionCount,
    mastered_at: masteredAt,
    ...(sched
      ? {
          schedule_mode: sched.mode,
          between_session_gap_days: sched.gapDays,
          booster_step: sched.boosterStep,
          next_due_at: iso(sched.nextDueAt),
        }
      : {}),
  };
  const { error: stateErr } = await supabase
    .from("target_state")
    .upsert(stateUpdate as never, { onConflict: "target_id" });
  if (stateErr)
    return failAction("endSession: target_state", stateErr, "Could not close the session.");

  if (progress.mastered) {
    const { error: statusErr } = await supabase
      .from("targets")
      .update({ status: "mastered" })
      .eq("id", targetId);
    if (statusErr)
      return failAction("endSession: status", statusErr, "Could not close the session.");
  }

  const count = (o: SessionState["trials"][number]["outcome"]) =>
    snapshot.trials.filter((t) => t.outcome === o).length;
  const endSummary = {
    ...summary,
    snapshot,
    stats: {
      recalls: count("recall"),
      misses: count("miss"),
      unclears: count("unclear"),
      endReason: snapshot.endReason,
      rescopeRequired: snapshot.rescopeRequired,
    },
  };
  const { error: closeErr } = await supabase
    .from("sessions")
    .update({ ended_at: iso(at), summary: toJson(endSummary) })
    .eq("id", sessionId);
  if (closeErr) return failAction("endSession: close", closeErr, "Could not close the session.");

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

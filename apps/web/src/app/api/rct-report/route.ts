import {
  buildRctReportPrompt,
  type RctAnnotation,
  type RctSession,
  type RctTargetState,
  type RctTrial,
  serializeTrialLog,
} from "@keepsake/core/prompts/rct-report";
import { defaultsForEtiology } from "@keepsake/core/sr";
import { z } from "zod";
import { assertAiQuota, QuotaError, streamText } from "@/lib/ai/core";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/rct-report — streams a single-subject study report over the caller's real trial logs.
 * Auth-gated + quota-gated; fetches sessions/trials/target_state via the RLS user client (own
 * patient only). Streams RAW UTF-8 text (no SSE framing) so the client reads it with a
 * ReadableStream reader + TextDecoder. Data minimization: only display_name + target text reach
 * the prompt — never emails or ids.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ question: z.string().trim().min(5).max(300) }).strict();

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** ISO instant → YYYY-MM-DD in the patient's timezone (calendar-day rules resolve there). */
function dayInTz(iso: string, timeZone: string): string {
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

function asRecord(json: Json | null | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

/** Pull endReason from a session summary (stats or snapshot), tolerating null/legacy shapes. */
function endReasonOf(summary: Record<string, unknown>): string | null {
  const stats = asRecord(summary.stats as Json);
  const snap = asRecord(summary.snapshot as Json);
  const reason = stats.endReason ?? snap.endReason;
  return typeof reason === "string" ? reason : null;
}

function annotationsOf(summary: Record<string, unknown>): RctAnnotation[] {
  const raw = summary.annotations;
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const o = asRecord(a as Json);
    return {
      kind: typeof o.kind === "string" ? o.kind : "note",
      note: typeof o.note === "string" ? o.note : undefined,
      fromSec: typeof o.fromSec === "number" ? o.fromSec : undefined,
      toSec: typeof o.toSec === "number" ? o.toSec : undefined,
    };
  });
}

const asOutcome = (o: string): RctTrial["outcome"] =>
  o === "miss" || o === "unclear" ? o : "recall";

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success)
    return jsonError("Please write a question between 5 and 300 characters.", 400);
  const { question } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Please sign in again to run a report.", 401);

  try {
    await assertAiQuota(supabase, "rct");
  } catch (err) {
    if (err instanceof QuotaError) return jsonError(err.message, 429);
    return jsonError("The report isn't available right now.", 503);
  }

  // RLS scopes every read below to the caller's own patient/rows.
  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, display_name, etiology, timezone")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientErr) return jsonError("The report isn't available right now.", 503);
  if (!patient) return jsonError("There's no practice data to analyze yet.", 404);

  const [targetsRes, statesRes, sessionsRes] = await Promise.all([
    supabase
      .from("targets")
      .select("id, question, answer, status, candidacy")
      .eq("patient_id", patient.id),
    supabase.from("target_state").select("*"),
    supabase
      .from("sessions")
      .select("id, started_at, summary")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
  ]);
  if (targetsRes.error || statesRes.error || sessionsRes.error) {
    return jsonError("The report isn't available right now.", 503);
  }

  const targets = targetsRes.data ?? [];
  const states = statesRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id);

  const trialsRes = sessionIds.length
    ? await supabase
        .from("trials")
        .select("session_id, target_id, interval_sec, outcome, corrected, is_screening, at")
        .in("session_id", sessionIds)
        .order("at", { ascending: true })
    : { data: [], error: null };
  if (trialsRes.error) return jsonError("The report isn't available right now.", 503);
  const trials = trialsRes.data ?? [];

  const stateByTarget = new Map(states.map((s) => [s.target_id, s]));
  const answerByTarget = new Map(targets.map((t) => [t.id, t.answer]));

  const targetStates: RctTargetState[] = targets.map((t) => {
    const st = stateByTarget.get(t.id);
    return {
      question: t.question,
      answer: t.answer,
      status: t.status,
      candidacy: t.candidacy,
      lastSuccessIntervalSec: st?.last_success_interval_sec ?? null,
      startStreak: st?.start_streak ?? 0,
      badSessions: st?.bad_sessions ?? 0,
      sessionCount: st?.session_count ?? 0,
      mastered: st?.mastered_at != null,
      scheduleMode: st?.schedule_mode ?? null,
      betweenSessionGapDays: st?.between_session_gap_days ?? null,
      boosterStep: st?.booster_step ?? null,
      nextDueAt: st?.next_due_at ? dayInTz(st.next_due_at, patient.timezone) : null,
    };
  });

  const trialsBySession = new Map<string, typeof trials>();
  for (const tr of trials) {
    const list = trialsBySession.get(tr.session_id) ?? [];
    list.push(tr);
    trialsBySession.set(tr.session_id, list);
  }

  const rctSessions: RctSession[] = sessions.map((s) => {
    const summary = asRecord(s.summary);
    const sTrials = trialsBySession.get(s.id) ?? [];
    const targetId = sTrials[0]?.target_id;
    const note = typeof summary.note === "string" ? summary.note : null;
    return {
      date: dayInTz(s.started_at, patient.timezone),
      targetLabel: (targetId && answerByTarget.get(targetId)) || "target",
      endReason: endReasonOf(summary),
      note,
      annotations: annotationsOf(summary),
      trials: sTrials.map(
        (tr): RctTrial => ({
          intervalSec: tr.interval_sec,
          outcome: asOutcome(tr.outcome),
          corrected: tr.corrected,
          isScreening: tr.is_screening,
        }),
      ),
    };
  });

  const { config } = defaultsForEtiology(patient.etiology);
  const dataset = serializeTrialLog({
    patientName: patient.display_name,
    etiology: patient.etiology,
    config: {
      baseIntervalSec: config.baseIntervalSec,
      maxIntervalSec: config.maxIntervalSec,
      growthFactor: config.growthFactor,
      masteryStreak: config.masteryStreak,
      firstGapDays: config.firstGapDays,
      boosterCadenceDays: config.boosterCadenceDays,
    },
    targets: targetStates,
    sessions: rctSessions,
  });

  const { system, user: userMessage } = buildRctReportPrompt({ dataset, question, locale: "en" });

  const stream = streamText({
    kind: "rct",
    system,
    user: userMessage,
    maxTokens: 8192,
    effort: "high",
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

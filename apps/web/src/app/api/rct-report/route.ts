import { z } from "zod";
import { assertAiQuota, QuotaError } from "@/lib/ai/core";
import { buildRctInputs } from "@/lib/ai/rct-data";
import { runRctReport } from "@/lib/ai/rct-report";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/rct-report — Claude runs its OWN single-subject analysis (agentic tool-use V2) over the
 * caller's real trial logs and returns a JSON `{ report, trail }`: the study report plus the
 * ordered list of analyses Claude chose to run. Auth-gated + quota-gated (one "rct" unit per
 * report). All reads go through the RLS user client (own patient only) in ONE pass here — that read
 * is the security boundary; the analysis tools are pure aggregates over it. Data minimization: only
 * display_name + target text reach the prompt context, and tool results carry numbers/dates/codes
 * only — never ids, emails, or names.
 */

export const dynamic = "force-dynamic";

const bodySchema = z.object({ question: z.string().trim().min(5).max(300) }).strict();

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

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
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("target_state")
      .select(
        "target_id, last_success_interval_sec, start_streak, bad_sessions, session_count, mastered_at, schedule_mode, between_session_gap_days, booster_step, next_due_at",
      ),
    supabase
      .from("sessions")
      .select("id, started_at, affect_pre, affect_post")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
  ]);
  if (targetsRes.error || statesRes.error || sessionsRes.error) {
    return jsonError("The report isn't available right now.", 503);
  }

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

  const { context, data } = buildRctInputs({
    patient,
    targets: targetsRes.data ?? [],
    states: statesRes.data ?? [],
    sessions,
    trials: trialsRes.data ?? [],
  });

  try {
    const result = await runRctReport({ context, question, locale: "en", data });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("The report isn't available right now.", 503);
  }
}

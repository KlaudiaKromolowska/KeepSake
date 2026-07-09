import { toCsv } from "@/lib/export/csv";
import { buildTrialCsvRows, TRIAL_CSV_HEADER } from "@/lib/export/trial-export";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/export — trial-level CSV export of the caller's own patient data (PLAN.md §12 "CSV
 * export" / V3 "research export"): the structured, downloadable dataset the field lacks. Auth-gated
 * and read-only. Every read runs on the RLS user client (own patient only) — never the service-role
 * client, matching /api/rct-report's data-access shape. One row per trial; see
 * lib/export/trial-export.ts for the column set and data-minimization notes.
 */

export const dynamic = "force-dynamic";

const textError = (message: string, status: number) =>
  new Response(message, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return textError("Please sign in again to export data.", 401);

  // RLS scopes every read below to the caller's own patient/rows.
  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientErr) return textError("Export isn't available right now.", 503);
  if (!patient) return textError("There's no practice data to export yet.", 404);

  const [targetsRes, sessionsRes] = await Promise.all([
    supabase.from("targets").select("id, question").eq("patient_id", patient.id),
    supabase
      .from("sessions")
      .select("id, started_at, affect_pre, affect_post")
      .eq("patient_id", patient.id)
      .order("started_at", { ascending: true }),
  ]);
  if (targetsRes.error || sessionsRes.error)
    return textError("Export isn't available right now.", 503);

  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const trialsRes = sessionIds.length
    ? await supabase
        .from("trials")
        .select(
          "id, session_id, target_id, interval_sec, outcome, is_screening, corrected, latency_ms, at",
        )
        .in("session_id", sessionIds)
        .order("at", { ascending: true })
    : { data: [], error: null };
  if (trialsRes.error) return textError("Export isn't available right now.", 503);

  const rows = buildTrialCsvRows({
    targets: targetsRes.data ?? [],
    sessions,
    trials: trialsRes.data ?? [],
  });
  const csv = toCsv(TRIAL_CSV_HEADER, rows);

  // Best-effort audit trail entry (audit_log is append-only + RLS-scoped to the caller's own
  // caregiver_id); a failure here must never block the caregiver's own export.
  try {
    const { error: auditErr } = await supabase
      .from("audit_log")
      .insert({ caregiver_id: user.id, action: "data_export", detail: { row_count: rows.length } });
    if (auditErr) console.error("audit_log insert failed", auditErr);
  } catch (err) {
    console.error("audit_log insert threw", err);
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keepsake-export-${date}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}

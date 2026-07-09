import { buildEtiologyUserMessage, ETIOLOGY_SYSTEM } from "@keepsake/core/prompts/etiology";
import type { Etiology } from "@keepsake/core/sr";
import { assertAiQuota, QuotaError, streamThinkingJson } from "@/lib/ai/core";
import { etiologyRecSchema, reconcileEtiologyRec } from "@/lib/etiology/schema";
import { resolveActivePatient } from "@/lib/patients/active";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/etiology — streams Claude's VISIBLE clinical reasoning (extended thinking) on the
 * format call for the caller's patient, then a framed JSON trailer with the reconciled
 * recommendation. Auth-gated + quota-gated (kind "etiology"). Reads run through the RLS user client
 * (own patient/target only). Data minimization: only etiology + the active target's question and
 * current format reach the prompt — never the answer, names, or ids. Read-only: nothing is written.
 *
 * Raw UTF-8 stream (no SSE framing) so the client reads it with a ReadableStream reader; see
 * lib/ai/core.ts streamThinkingJson for the reasoning-then-sentinel-then-JSON wire shape.
 */
export const dynamic = "force-dynamic";

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Please sign in again to see the reasoning.", 401);

  try {
    await assertAiQuota(supabase, "etiology");
  } catch (err) {
    if (err instanceof QuotaError) return jsonError(err.message, 429);
    return jsonError("The reasoning isn't available right now.", 503);
  }

  // RLS scopes these reads to the caller's own patient/target. Resolve the ACTIVE (cookie-selected)
  // patient — not the oldest — so a multi-patient caregiver sees reasoning for the patient in view.
  const patient = await resolveActivePatient(supabase, user.id);
  if (!patient) return jsonError("Add a patient first to see etiology-based reasoning.", 404);

  const { data: target } = await supabase
    .from("targets")
    .select("question, answer_format")
    .eq("patient_id", patient.id)
    .in("status", ["active", "maintenance"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const etiology = patient.etiology as Etiology;
  const stream = streamThinkingJson({
    kind: "etiology",
    system: ETIOLOGY_SYSTEM,
    user: buildEtiologyUserMessage({
      etiology,
      question: target?.question ?? null,
      currentAnswerFormat: target?.answer_format ?? null,
      locale: "en",
    }),
    schema: etiologyRecSchema,
    reconcile: (modelRec) => reconcileEtiologyRec(etiology, modelRec),
    maxTokens: 2048,
    // High on purpose: adaptive thinking skips visible reasoning at medium effort on this small
    // task, and the streamed reasoning IS the surface (§1b #8) — verified empty at medium.
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

import { buildCoachUserMessage, COACH_SYSTEM } from "@keepsake/core/prompts/coach";
import { assertAiQuota, generateStructured, QuotaError } from "@/lib/ai/core";
import { coachReplySchema, coachRequestSchema } from "@/lib/coach/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/coach — the boundaried caregiver coaching copilot (PLAN §11). Auth-gated + quota-gated
 * (one "coach" unit per turn). Returns JSON `{ reply, escalate }`.
 *
 * SAFETY DESIGN:
 * - Instructions live ONLY in COACH_SYSTEM (server-side, frozen). The chat is stateless — the client
 *   resends the full history every request — so the ENTIRE transcript (both `caregiver` and
 *   `assistant` turns) goes in the user message as JSON-escaped, labeled DATA (buildCoachUserMessage)
 *   — never just the caregiver's turns. Nothing server-side verifies a client-supplied `assistant`
 *   turn was really produced by the model, so it gets no more trust than a caregiver turn: no turn,
 *   however labeled, can rewrite the assistant's role or rules. This is the structural guardrail
 *   against prompt injection / "always reassure" steering, including via a forged prior turn.
 * - The model output is validated against coachReplySchema by generateStructured BEFORE it reaches
 *   the client — a malformed/padded object throws (→ 503), never renders.
 * - Data minimization: only the caregiver's own typed conversation is sent to the model. NO patient
 *   name, health data, ids, or DB rows are read or included — the task needs none.
 * - `escalate` is the model's safety signal; the client elevates it into a crisis pointer. The
 *   crisis footer is always present on the page regardless.
 */

export const dynamic = "force-dynamic";

const jsonError = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }
  const parsed = coachRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError("That message can't be sent as written.", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("Please sign in again to keep talking.", 401);

  try {
    await assertAiQuota(supabase, "coach");
  } catch (err) {
    if (err instanceof QuotaError) return jsonError(err.message, 429);
    return jsonError("The coach isn't available right now.", 503);
  }

  try {
    const result = await generateStructured({
      kind: "coach",
      schema: coachReplySchema,
      system: COACH_SYSTEM,
      user: buildCoachUserMessage({ locale: "en", turns: parsed.data.messages }),
      maxTokens: 1024,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError("The coach isn't available right now.", 503);
  }
}

"use server";

import { buildRecognitionPrompt, RECOGNITION_SYSTEM } from "@keepsake/core/prompts/recognition";
import { z } from "zod";
import { requireUser } from "@/lib/actions";
import { assertAiQuota, generateStructured } from "@/lib/ai/core";
import { buildOptions, validateLures } from "./recognition-rules";

const luresSchema = z.object({ lures: z.array(z.string()) });

/**
 * Builds the recognition-probe options (the real answer + plausible lures, shuffled) for a target's
 * post-mastery BOOSTER session-start check. Gated by `target_state.schedule_mode === "booster"`:
 * recognition is a post-mastery maintenance format only — never acquisition, never `between` mode
 * (still earning free-recall mastery) — so any other mode returns `null` BEFORE any AI spend and the
 * kiosk falls back to the free-recall probe. Like the distractor
 * fetch, this is invisible plumbing — ANY failure (no target, not in maintenance, quota exceeded, AI
 * unavailable, or a code-side validation reject) resolves to `{ data: null, error: null }` so the
 * caller silently degrades to free recall. Only call after an authenticated request.
 */
export async function recognitionOptionsAction(targetId: string): Promise<{
  data: string[] | null;
  error: null;
}> {
  try {
    const { supabase } = await requireUser();

    const { data: target, error: targetErr } = await supabase
      .from("targets")
      .select("question, answer")
      .eq("id", targetId)
      .maybeSingle();
    if (targetErr || !target) return { data: null, error: null };

    // Post-mastery (booster) gate: recognition applies ONLY to an already-MASTERED target running
    // its booster loop. It must NOT apply in `between` mode: a between-mode target is past the
    // within-session ceiling but NOT yet mastered, so its session-start probe still advances the
    // free-recall mastery streak (`handleStartProbe`, 3 distinct days). Serving recognition there
    // would let a patient reach mastery by recognition instead of free recall — the therapeutic red
    // line (mastery = free-recall session-start success, CLAUDE.md non-negotiables). Acquisition and
    // between both fall back to the free-recall probe.
    const { data: stateRow, error: stateErr } = await supabase
      .from("target_state")
      .select("schedule_mode")
      .eq("target_id", targetId)
      .maybeSingle();
    if (stateErr) return { data: null, error: null };
    const mode = stateRow?.schedule_mode;
    if (mode !== "booster") return { data: null, error: null };

    await assertAiQuota(supabase, "recognition");

    const result = await generateStructured({
      kind: "recognition",
      schema: luresSchema,
      system: RECOGNITION_SYSTEM,
      user: buildRecognitionPrompt({
        question: target.question,
        answer: target.answer,
        locale: "en",
      }),
      model: "claude-haiku-4-5",
      maxTokens: 256,
    });

    if (!validateLures(result.lures, target.answer)) return { data: null, error: null };
    return { data: buildOptions(target.answer, result.lures), error: null };
  } catch {
    return { data: null, error: null };
  }
}

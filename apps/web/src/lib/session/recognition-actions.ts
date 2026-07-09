"use server";

import { buildRecognitionPrompt, RECOGNITION_SYSTEM } from "@keepsake/core/prompts/recognition";
import { z } from "zod";
import { requireUser } from "@/lib/actions";
import { assertAiQuota, generateStructured } from "@/lib/ai/core";
import { buildOptions, validateLures } from "./recognition-rules";

const luresSchema = z.object({ lures: z.array(z.string()) });

/**
 * Builds the recognition-probe options (the real answer + plausible lures, shuffled) for a target's
 * MAINTENANCE/BOOSTER session-start check. Gated by `target_state.schedule_mode`: recognition is a
 * maintenance format only, never acquisition, so a target with no between/booster schedule returns
 * `null` BEFORE any AI spend and the kiosk falls back to the free-recall probe. Like the distractor
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

    // Maintenance/booster gate: recognition applies ONLY to a target already in the between-session
    // or booster schedule. Acquisition (no schedule row / null mode) trains free recall — untouched.
    const { data: stateRow, error: stateErr } = await supabase
      .from("target_state")
      .select("schedule_mode")
      .eq("target_id", targetId)
      .maybeSingle();
    if (stateErr) return { data: null, error: null };
    const mode = stateRow?.schedule_mode;
    if (mode !== "between" && mode !== "booster") return { data: null, error: null };

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

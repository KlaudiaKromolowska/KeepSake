"use server";

import { buildGradePrompt, GRADE_SYSTEM } from "@keepsake/core/prompts/grade";
import { matchTranscript, suggestionForVerdict } from "@keepsake/core/speech";
import type { ActionResult } from "@/lib/actions";
import { requireUser } from "@/lib/actions";
import { assertAiQuota, generateStructured } from "@/lib/ai/core";
import {
  aliasesFromJson,
  type GradeSuggestion,
  gradeInputSchema,
  gradeVerdictSchema,
} from "./grade-schema";

const zerr = (issues: { message: string }[]) => issues.map((i) => i.message).join("; ");

/** No suggestion — the caregiver decides. Every downstream failure resolves here, never to a verdict. */
const NONE: ActionResult<GradeSuggestion> = { data: { suggestion: null }, error: null };

/**
 * V1 speech assist grader (PLAN §9): fuzzy match first, Haiku ONLY on the ambiguous middle band.
 * Returns a *suggestion* the caregiver confirms with a tap — it never records an outcome and never
 * moves the ladder. The answer/aliases are re-read server-side from the RLS'd target row (the
 * client's copy is never trusted), and the fuzzy match is re-run here so a manipulated client
 * cannot spend AI quota on a case the matcher already decides. The transcript is untrusted data:
 * it reaches Claude only inside the user message, labeled DATA, under a static system prompt.
 * Any failure past input validation degrades to "no suggestion" — assist layers never block a probe.
 */
export async function gradeRecallAction(input: unknown): Promise<ActionResult<GradeSuggestion>> {
  const parsed = gradeInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };
  const { targetId, transcript } = parsed.data;

  const { supabase } = await requireUser();

  try {
    const { data: target, error: targetErr } = await supabase
      .from("targets")
      .select("question, answer, accepted_variants")
      .eq("id", targetId)
      .single();
    if (targetErr || !target) return NONE;

    const aliases = aliasesFromJson(target.accepted_variants);
    const verdict = matchTranscript(transcript, target.answer, aliases);
    if (verdict !== "ambiguous") {
      return { data: { suggestion: suggestionForVerdict(verdict) }, error: null };
    }

    await assertAiQuota(supabase, "grade");
    const result = await generateStructured({
      kind: "grade",
      schema: gradeVerdictSchema,
      system: GRADE_SYSTEM,
      user: buildGradePrompt({
        question: target.question,
        answer: target.answer,
        aliases,
        transcript,
        locale: "en",
      }),
      model: "claude-haiku-4-5",
      maxTokens: 256,
    });
    return {
      data: { suggestion: result.verdict === "unclear" ? null : result.verdict },
      error: null,
    };
  } catch {
    return NONE;
  }
}

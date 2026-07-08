const PROMPT_COUNT = 8;
const MAX_PROMPT_LEN = 90;
/** Words that turn a question into a recall demand for the trained target (name/fact retrieval). */
const RECALL_WORDS = /\b(who|name|remember|recall)\b/i;

/**
 * Code-side re-check on top of the generation schema: exactly 8 items, each non-empty and ≤ 90
 * chars, none containing the trained answer, none phrasing a question that demands recalling the
 * trained target. Pure and exported so it can be unit-tested directly (mirrors wizard's
 * validateTarget). Lives outside the "use server" action file — a `"use server"` module may only
 * export async server actions.
 */
export function validateDistractors(prompts: string[], trainedAnswer: string): boolean {
  if (prompts.length !== PROMPT_COUNT) return false;
  const answerLower = trainedAnswer.trim().toLowerCase();
  return prompts.every((prompt) => {
    if (prompt.length === 0 || prompt.length > MAX_PROMPT_LEN) return false;
    const lower = prompt.toLowerCase();
    if (answerLower !== "" && lower.includes(answerLower)) return false;
    if (prompt.includes("?") && RECALL_WORDS.test(prompt)) return false;
    return true;
  });
}

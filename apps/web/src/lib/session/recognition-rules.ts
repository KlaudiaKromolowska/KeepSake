import { RECOGNITION_LURE_COUNT } from "@keepsake/core/prompts/recognition";
import type { Outcome } from "@keepsake/core/sr";

const MAX_LURE_LEN = 40;

/**
 * Code-side re-check on top of the generation schema (mirrors validateDistractors): exactly the
 * expected number of lures, each a non-empty ≤ 40-char string that is NOT the answer, does not
 * contain the answer (or vice-versa), and is distinct from the other lures — all compared
 * case-insensitively. Model output is never trusted into the UI without passing this. Pure and
 * exported so it can be unit-tested directly.
 */
export function validateLures(lures: string[], answer: string): boolean {
  if (lures.length !== RECOGNITION_LURE_COUNT) return false;
  const answerLower = answer.trim().toLowerCase();
  if (answerLower === "") return false;
  const seen = new Set<string>();
  for (const lure of lures) {
    const trimmed = lure.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_LURE_LEN) return false;
    const lower = trimmed.toLowerCase();
    if (lower === answerLower) return false;
    if (lower.includes(answerLower) || answerLower.includes(lower)) return false;
    if (seen.has(lower)) return false;
    seen.add(lower);
  }
  return true;
}

/**
 * Assemble the recognition options the kiosk shows: the real answer (injected code-side, never from
 * the model) plus the validated lures, trimmed and shuffled. `rng` is injectable so the shuffle is
 * deterministic under test; production passes `Math.random`.
 */
export function buildOptions(
  answer: string,
  lures: string[],
  rng: () => number = Math.random,
): string[] {
  const options = [answer.trim(), ...lures.map((l) => l.trim())];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

/**
 * Map a recognition pick to the engine's existing outcome model — the ONLY place the input-mode
 * change touches outcomes. A pick equal to the answer (case-insensitive) is the existing `recall`;
 * anything else is the existing `miss`, which routes into the unchanged errorless-correction flow.
 * The reducer in packages/core is untouched: recognition is a UI/input mode, not a new outcome.
 */
export function outcomeForPick(pick: string, answer: string): Outcome {
  return pick.trim().toLowerCase() === answer.trim().toLowerCase() ? "recall" : "miss";
}

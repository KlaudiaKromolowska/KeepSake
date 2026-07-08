/**
 * Code-side validation of a wizard proposal — the SR-method §4.4 rules, enforced independently of
 * whatever Claude returns (model output is untrusted). Pure and side-effect free so it can be unit
 * tested exhaustively AND reused verbatim as the Phase-4 eval assertions. A failure list feeds the
 * ONE corrective re-ask (the action appends it to the user message); if the re-ask still fails, the
 * caregiver is offered hand-entry. `redFlags` from the model are non-blocking and pass through the
 * UI separately — they are advisories, not rule violations.
 */

/** Thresholds (also the eval bounds). Working-memory span: a short, single, concrete answer. */
export const QUESTION_MAX_CHARS = 120;
export const ANSWER_MIN_WORDS = 1;
export const ANSWER_MAX_WORDS = 6;
export const ANSWER_MAX_CHARS = 40;

/** A question opening with one of these reads as a yes/no prompt — excluded by SR method. */
const YES_NO_OPENERS = /^(is|are|do|does|did|can|was|were)\b/i;

export interface TargetLike {
  question: string;
  answer: string;
}

export type ValidationResult = { ok: true } | { ok: false; violations: string[] };

function wordCount(s: string): number {
  const t = s.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/**
 * Check a proposal against the SR authoring rules. Returns every violation at once (so a single
 * re-ask can fix them together) as imperative sentences the model can act on.
 */
export function validateTarget(t: TargetLike): ValidationResult {
  const violations: string[] = [];
  const question = t.question.trim();
  const answer = t.answer.trim();

  if (!question.endsWith("?")) {
    violations.push("The question must be a single question ending with a question mark.");
  }
  if (question.length > QUESTION_MAX_CHARS) {
    violations.push(`The question must be at most ${QUESTION_MAX_CHARS} characters long.`);
  }
  if (YES_NO_OPENERS.test(question)) {
    violations.push(
      "The question must not be a yes/no question. Ask for the fact itself (who, what, where).",
    );
  }

  const words = wordCount(answer);
  if (words < ANSWER_MIN_WORDS) {
    violations.push("The answer must not be empty.");
  } else if (words > ANSWER_MAX_WORDS) {
    violations.push(
      `The answer must be ${ANSWER_MAX_WORDS} words or fewer — one short, concrete fact.`,
    );
  }
  if (answer.length > ANSWER_MAX_CHARS) {
    violations.push(`The answer must be short — at most ${ANSWER_MAX_CHARS} characters.`);
  }

  if (answer !== "" && question.toLowerCase().includes(answer.toLowerCase())) {
    violations.push("The question already contains the answer. Rephrase so it must be recalled.");
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

/**
 * Normalize Claude's acceptedVariants (model output is untrusted): trim, drop empties, drop any
 * variant equal to the answer, and dedupe — both case-insensitively, keeping the first spelling.
 * A live call returned the answer itself as a variant, which the UI rendered as "Lena, Lena".
 */
export function normalizeVariants(answer: string, variants: string[]): string[] {
  const seen = new Set([answer.trim().toLowerCase()]);
  const out: string[] = [];
  for (const raw of variants) {
    const variant = raw.trim();
    const key = variant.toLowerCase();
    if (variant === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(variant);
  }
  return out;
}

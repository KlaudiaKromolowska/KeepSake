/**
 * Zod schema for Claude's raw etiology recommendation + the deterministic-mapping cross-check.
 * Pure and sync (no "use server"), so it is shared by the streaming route and the fixture recorder.
 *
 * The GUARD: `defaultsForEtiology` (packages/core/sr) is the source of truth for answer format. If
 * Claude's recommended format contradicts the deterministic mapping, the deterministic mapping wins
 * and the reconciled result flags `contradicted` so the UI can say so. Model output is never
 * surfaced or applied without passing through reconcileEtiologyRec.
 */
import { type AnswerFormat, defaultsForEtiology, type Etiology } from "@keepsake/core/sr";
import { z } from "zod";

/** The raw shape Claude is asked to emit (validated before it is trusted). */
export const etiologyRecSchema = z
  .object({
    answerFormat: z.enum(["free_recall", "recognition"]),
    responseWindow: z.string().trim().min(1).max(400),
    cueModality: z.string().trim().min(1).max(400),
    why: z.string().trim().min(1).max(400),
  })
  .strict();

export type EtiologyRec = z.infer<typeof etiologyRecSchema>;

/** The reconciled recommendation the route emits and the UI renders. */
export interface EtiologyRecommendation {
  etiology: Etiology;
  /** Deterministic mapping wins — this is the format that would actually apply. */
  answerFormat: AnswerFormat;
  deterministicRationale: string;
  /** What Claude recommended (null when the model output was unusable). */
  modelAnswerFormat: AnswerFormat | null;
  /** True when Claude's format disagreed with the deterministic mapping (deterministic still wins). */
  contradicted: boolean;
  modelAvailable: boolean;
  /** Advisory, UI-side-only guidance from the model (never a source of truth). */
  responseWindow: string | null;
  cueModality: string | null;
  why: string | null;
}

/**
 * Cross-check a model recommendation against the deterministic etiology→format defaults. The
 * deterministic `answerFormat` always wins; `contradicted` records disagreement. A null model rec
 * (parse/fallback failure) still yields a valid deterministic-only recommendation.
 */
export function reconcileEtiologyRec(
  etiology: Etiology,
  modelRec: EtiologyRec | null,
): EtiologyRecommendation {
  const det = defaultsForEtiology(etiology);
  return {
    etiology,
    answerFormat: det.answerFormat,
    deterministicRationale: det.rationale,
    modelAnswerFormat: modelRec?.answerFormat ?? null,
    contradicted: modelRec != null && modelRec.answerFormat !== det.answerFormat,
    modelAvailable: modelRec != null,
    responseWindow: modelRec?.responseWindow ?? null,
    cueModality: modelRec?.cueModality ?? null,
    why: modelRec?.why ?? null,
  };
}

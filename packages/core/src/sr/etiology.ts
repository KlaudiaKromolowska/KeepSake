import { DEFAULT_SR_CONFIG, type SrConfig } from "./config";
import type { AnswerFormat, Etiology } from "./types";

/** Protocol tuning defaults surfaced by etiology (PLAN §3.3). V1 feature — MVP ships the fn + tests. */
export interface EtiologyDefaults {
  answerFormat: AnswerFormat;
  config: SrConfig; // tuned copy of DEFAULT_SR_CONFIG — never the shared instance
  /** one-line clinical rationale, surfaced in the target wizard UI later */
  rationale: string;
}

// No head-to-head cross-etiology trial exists — these tunings are evidence-informed defaults,
// flagged here as a starting point to refine once outcome data comes in.
// `candidacyLevelsSec` is deliberately etiology-invariant: it's the fixed Brush & Camp clinical
// screen, not a tunable protocol parameter, so no case below touches it.
export function defaultsForEtiology(etiology: Etiology): EtiologyDefaults {
  switch (etiology) {
    case "alzheimers":
      return {
        answerFormat: "free_recall",
        config: { ...DEFAULT_SR_CONFIG, growthFactor: 1.5 },
        rationale: "Early AD loses learning from large errors — gentler ×1.5 expansion.",
      };
    case "vascular":
      return {
        answerFormat: "free_recall",
        config: { ...DEFAULT_SR_CONFIG },
        rationale: "Default intervals; longer response windows + cue structure are UI-side.",
      };
    case "lewy":
      return {
        answerFormat: "recognition",
        config: { ...DEFAULT_SR_CONFIG, baseIntervalSec: 10, growthFactor: 1.5 },
        rationale: "DLB forgets faster — recognition over free recall, tighter early intervals.",
      };
    case "parkinsons":
      return {
        answerFormat: "recognition",
        config: { ...DEFAULT_SR_CONFIG, baseIntervalSec: 10, growthFactor: 1.5 },
        rationale: "Recognition beats free recall for PD; tighter early intervals as with DLB.",
      };
    case "mixed":
    case "unspecified":
      return {
        answerFormat: "free_recall",
        config: { ...DEFAULT_SR_CONFIG },
        rationale: "No single-etiology profile applies — use unmodified defaults.",
      };
  }
}

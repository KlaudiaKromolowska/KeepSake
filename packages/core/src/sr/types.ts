export type Outcome = "recall" | "miss" | "unclear";
export type Etiology = "alzheimers" | "vascular" | "lewy" | "parkinsons" | "mixed" | "unspecified";
export type AnswerFormat = "free_recall" | "recognition";

/** One probe result, engine-side mirror of the `trials` DB row. */
export interface TrialRecord {
  intervalSec: number;
  outcome: Outcome;
  isScreening: boolean;
  /** true when this trial ended in the device-delivered errorless correction */
  corrected: boolean;
  /** event timestamp, epoch ms (injected — never read from a clock in core) */
  at: number;
}

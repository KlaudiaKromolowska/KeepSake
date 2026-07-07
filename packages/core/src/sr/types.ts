export type Outcome = "recall" | "miss" | "unclear";
export type Etiology = "alzheimers" | "vascular" | "lewy" | "parkinsons" | "mixed" | "unspecified";
export type AnswerFormat = "free_recall" | "recognition";

/**
 * One probe result — the engine-side subset of the `trials` DB row. `latency_ms` and
 * `time_of_day` are boundary-computed at persistence time and are deliberately absent here.
 */
export interface TrialRecord {
  intervalSec: number;
  outcome: Outcome;
  isScreening: boolean;
  /** true when this trial ended in the device-delivered errorless correction */
  corrected: boolean;
  /** event timestamp, epoch ms (injected — never read from a clock in core) */
  at: number;
}

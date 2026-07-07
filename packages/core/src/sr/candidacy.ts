import type { SrConfig } from "./config";
import type { Outcome, TrialRecord } from "./types";

/** State of the Brush & Camp candidacy screen (PLAN §4.1). */
export interface CandidacyState {
  levelIndex: number;
  attemptsUsed: number;
  unclearRun: number;
  status: "in_progress" | "passed" | "failed";
  /** device must deliver the errorless correction before the next probe */
  correctionRequired: boolean;
  trials: TrialRecord[];
}

export type CandidacyEvent =
  | { type: "probe_result"; outcome: Outcome; at: number }
  | { type: "correction_done"; at: number };

export function initialCandidacyState(): CandidacyState {
  return {
    levelIndex: 0,
    attemptsUsed: 0,
    unclearRun: 0,
    status: "in_progress",
    correctionRequired: false,
    trials: [],
  };
}

/** Interval to probe next, or null when the screen is over. */
export function currentLevelSec(state: CandidacyState, config: SrConfig): number | null {
  if (state.status !== "in_progress") return null;
  return config.candidacyLevelsSec[state.levelIndex] ?? null;
}

/** Records a confirmed miss (direct, or an unclear-run that converted): +1 attempt, correction owed. */
function confirmedMiss(
  state: CandidacyState,
  config: SrConfig,
  trial: TrialRecord,
): CandidacyState {
  const attemptsUsed = state.attemptsUsed + 1;
  const failed = attemptsUsed >= config.candidacyAttemptsPerLevel;
  return {
    ...state,
    attemptsUsed,
    unclearRun: 0,
    correctionRequired: true,
    status: failed ? "failed" : "in_progress",
    trials: [...state.trials, trial],
  };
}

export function candidacyReduce(
  state: CandidacyState,
  event: CandidacyEvent,
  config: SrConfig,
): CandidacyState {
  // Once the screen has concluded, only an owed correction may still be delivered.
  if (state.status !== "in_progress") {
    if (state.correctionRequired && event.type === "correction_done") {
      return { ...state, correctionRequired: false };
    }
    return state;
  }

  if (event.type === "correction_done") {
    if (!state.correctionRequired) return state;
    return { ...state, correctionRequired: false };
  }

  // A probe while a correction is owed is a stray event.
  if (state.correctionRequired) return state;

  const levelSec = currentLevelSec(state, config);
  if (levelSec === null) return state; // unreachable: status === "in_progress" guarantees a level

  const trialBase = { intervalSec: levelSec, isScreening: true as const, at: event.at };

  if (event.outcome === "recall") {
    const trial: TrialRecord = { ...trialBase, outcome: "recall", corrected: false };
    const isLastLevel = state.levelIndex === config.candidacyLevelsSec.length - 1;
    return {
      levelIndex: isLastLevel ? state.levelIndex : state.levelIndex + 1,
      attemptsUsed: 0,
      unclearRun: 0,
      status: isLastLevel ? "passed" : "in_progress",
      correctionRequired: false,
      trials: [...state.trials, trial],
    };
  }

  if (event.outcome === "unclear") {
    const unclearRun = state.unclearRun + 1;
    if (unclearRun < config.unclearCap) {
      const trial: TrialRecord = { ...trialBase, outcome: "unclear", corrected: false };
      return { ...state, unclearRun, trials: [...state.trials, trial] };
    }
    const trial: TrialRecord = { ...trialBase, outcome: "unclear", corrected: true };
    return confirmedMiss(state, config, trial);
  }

  // event.outcome === "miss"
  const trial: TrialRecord = { ...trialBase, outcome: "miss", corrected: true };
  return confirmedMiss(state, config, trial);
}

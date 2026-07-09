import type { SessionPhase, SessionState, TrialRecord } from "@keepsake/core/sr";
import type { ActionResult } from "@/lib/actions";

/** Which screen a phase renders — the discriminant SessionView switches on. */
export type Screen = "teach" | "probe" | "correction" | "distractor" | "end_on_win" | "ended";

/** Runs a save action; failure = ActionResult error OR thrown rejection. */
export async function attemptSave(fn: () => Promise<ActionResult<null>>): Promise<boolean> {
  try {
    return (await fn()).error === null;
  } catch {
    return false;
  }
}

/** True when `next` gained a trial vs `prev` — the trigger to persist the latest trial. */
export function trialAdded(prev: SessionState, next: SessionState): boolean {
  return next.trials.length > prev.trials.length;
}

/** Number of `recall` outcomes — the "remembered" count shown on the end screen. */
export function recallCount(trials: readonly TrialRecord[]): number {
  return trials.filter((t) => t.outcome === "recall").length;
}

/**
 * Recognition options to show for the current probe, or `undefined` for the free-recall probe.
 * Recognition is a post-mastery BOOSTER format only: it is offered ONLY on the session-start probe
 * (`isStartProbe`) and only when the server produced options (which it does only for a mastered
 * target in the `booster` schedule — never `between`, which still earns free-recall mastery). A
 * reopened within-session retraining loop after a booster miss has `isStartProbe === false`, so it
 * reverts to free recall — acquisition and pre-mastery are never affected.
 */
export function recognitionForProbe(
  state: SessionState,
  options: readonly string[] | undefined,
): readonly string[] | undefined {
  return state.isStartProbe && options && options.length > 0 ? options : undefined;
}

/** Engine phase → screen key. Total over `SessionPhase` (exhaustive switch). */
export function screenForPhase(phase: SessionPhase): Screen {
  switch (phase) {
    case "teach":
      return "teach";
    case "awaiting_probe":
      return "probe";
    case "correcting":
      return "correction";
    case "distractor":
      return "distractor";
    case "end_on_win":
      return "end_on_win";
    case "ended":
      return "ended";
  }
}

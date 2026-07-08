// Pure decision logic: which line a session state transition speaks. The browser side (hook +
// playback backends) is a thin shim over this — all narration behavior is testable here.

import type { SessionState } from "@keepsake/core/sr";
import { type AudioCue, type AudioLineKey, buildCue, type SpokenTarget } from "./lines";

/** The slice of session state narration reads — structurally satisfied by a full SessionState. */
export type NarrationState = Pick<SessionState, "phase" | "trials"> & {
  progress: Pick<SessionState["progress"], "mastered">;
};

const ENCOURAGEMENTS = ["encourage-1", "encourage-2", "encourage-3"] as const;

/**
 * Phase-entry driven, one cue per transition (`prev === null` = mounting an already-started
 * session, which speaks the entered phase's line so audio always matches the screen). An unclear
 * re-probe is just distractor → awaiting_probe again, so it naturally re-speaks the bare question
 * with no correction framing (PLAN §4.2: unclear never corrects, never acknowledges).
 */
export function cueKeyForTransition(
  prev: NarrationState | null,
  next: NarrationState,
): AudioLineKey | null {
  if (prev !== null && prev.phase === next.phase) return null;
  switch (next.phase) {
    case "teach":
      return "teach";
    case "awaiting_probe":
      return "probe";
    case "correcting":
      return "correction";
    case "distractor": {
      // Entering the wait right after a live recall is the moment for a warm acknowledgment.
      // Other entries (post-teach, post-correction, unclear re-probe gap) start silently — and so
      // does a resume-mount (`prev === null`), where the last recall may be minutes old.
      const last = next.trials.at(-1);
      const gained = prev !== null && next.trials.length > prev.trials.length;
      if (!gained || last?.outcome !== "recall") return null;
      return encouragementKey(recallCount(next.trials));
    }
    case "end_on_win":
      return "end-on-win";
    case "ended":
      return next.progress.mastered ? "session-end-mastered" : "session-end";
  }
}

/** Full cue (slug + text) for a transition, or null when the transition is silent. */
export function cueForTransition(
  prev: NarrationState | null,
  next: NarrationState,
  target: SpokenTarget,
): AudioCue | null {
  const key = cueKeyForTransition(prev, next);
  return key === null ? null : buildCue(key, target);
}

/** Deterministic rotation so back-to-back recalls don't repeat the same praise. */
function encouragementKey(nthRecall: number): AudioLineKey {
  return ENCOURAGEMENTS[(nthRecall - 1) % ENCOURAGEMENTS.length] ?? "encourage-1";
}

function recallCount(trials: NarrationState["trials"]): number {
  return trials.filter((t) => t.outcome === "recall").length;
}

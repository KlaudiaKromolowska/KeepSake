import type { SrConfig } from "./config";
import type { Outcome } from "./types";

/**
 * Between-session monotone state machine + post-mastery boosters (PLAN §5).
 *
 * Integration contract with the session machine (`session.ts`):
 *
 * - A target enters between-session mode when a session ends with `handoffToScheduler: true`.
 *   `endReason` is the discriminator: `"ceiling"` → call `afterCeilingHandoff(at)`, `"mastered"`
 *   → call `afterMastery(at)`.
 * - `afterCeilingHandoff` is called ONLY when the target has no persisted `ScheduleState` yet
 *   (first entry into between-session mode). If a `ScheduleState` already exists (the item was
 *   reopened for within-session retraining and re-reached the ceiling), the existing state —
 *   including a previously shrunk or grown gap — is kept; do NOT re-initialize. This is how the
 *   shrunk gap survives the within-session round-trip.
 * - On a between-session session-start probe, the orchestrator feeds the SAME outcome to both
 *   `sessionReduce` (streak/mastery/loop-continuation) and `onSessionStartOutcome` (gap update).
 *   On the mastering recall (the session returns `endReason: "mastered"`), the scheduler's
 *   between-mode result is DISCARDED and `afterMastery` is called instead.
 * - `reopenWithinSession: true` and the session machine's own continuation into the trial loop
 *   after a start-probe miss are the SAME event, not two reopens.
 * - `unclear` never moves the schedule (mirrors "unclear never moves the ladder").
 */
export interface ScheduleState {
  mode: "between" | "booster";
  gapDays: number; // current between-session gap (mode "between")
  boosterStep: number; // index into boosterCadenceDays (mode "booster")
  nextDueAt: number; // epoch ms
}

/** Result of a scheduler outcome call — the persisted state, separated from the effect signal. */
export interface ScheduleOutcome {
  state: ScheduleState;
  /** The item returns to within-session re-training (PLAN §5). The session machine's own
   *  loop re-entry after a start-probe miss IS this same event — not a second reopen. */
  reopenWithinSession: boolean;
}

// Day-level precision is deliberate for MVP; morning-bias scheduling is a V1 refinement.
const DAY_MS = 86_400_000;

function dueAt(at: number, days: number): number {
  return at + days * DAY_MS;
}

/** Within-session ceiling reached (session handoffToScheduler, not mastered). */
export function afterCeilingHandoff(at: number, config: SrConfig): ScheduleState {
  return {
    mode: "between",
    gapDays: config.firstGapDays,
    boosterStep: 0,
    nextDueAt: dueAt(at, config.firstGapDays),
  };
}

/** Target mastered → maintenance boosters begin at step 0. */
export function afterMastery(at: number, config: SrConfig): ScheduleState {
  return {
    mode: "booster",
    gapDays: 0,
    boosterStep: 0,
    nextDueAt: dueAt(at, config.boosterCadenceDays[0] ?? 0),
  };
}

/**
 * Session-start probe outcome for a target in "between" mode. `unclear` never moves the
 * schedule — the session machine re-probes, so the scheduler state is untouched.
 */
export function onSessionStartOutcome(
  state: ScheduleState,
  outcome: Outcome,
  at: number,
  config: SrConfig,
): ScheduleOutcome {
  if (outcome === "unclear") return { state, reopenWithinSession: false };

  if (outcome === "recall") {
    const gapDays = Math.min(state.gapDays * config.gapGrowth, config.gapCapDays);
    return {
      state: { ...state, gapDays, nextDueAt: dueAt(at, gapDays) },
      reopenWithinSession: false,
    };
  }

  // outcome === "miss": gap shrinks and the item returns to within-session re-training.
  const gapDays = Math.max(state.gapDays * config.gapShrink, config.gapFloorDays);
  return {
    state: { ...state, gapDays, nextDueAt: dueAt(at, gapDays) },
    reopenWithinSession: true,
  };
}

/**
 * Booster probe outcome for a mastered target. `unclear` never moves the schedule, as above.
 */
export function onBoosterOutcome(
  state: ScheduleState,
  outcome: Outcome,
  at: number,
  config: SrConfig,
): ScheduleOutcome {
  if (outcome === "unclear") return { state, reopenWithinSession: false };

  const lastStep = config.boosterCadenceDays.length - 1;
  const boosterStep =
    outcome === "recall"
      ? Math.min(state.boosterStep + 1, lastStep)
      : Math.max(state.boosterStep - 1, 0);
  const cadenceDays = config.boosterCadenceDays[boosterStep] ?? 0;
  return {
    state: { ...state, boosterStep, nextDueAt: dueAt(at, cadenceDays) },
    reopenWithinSession: outcome === "miss",
  };
}

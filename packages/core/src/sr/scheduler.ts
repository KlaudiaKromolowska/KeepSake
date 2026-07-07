import type { SrConfig } from "./config";
import type { Outcome } from "./types";

/** Between-session monotone state machine + post-mastery boosters (PLAN §5). */
export interface ScheduleState {
  mode: "between" | "booster";
  gapDays: number; // current between-session gap (mode "between")
  boosterStep: number; // index into boosterCadenceDays (mode "booster")
  nextDueAt: number; // epoch ms
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
): ScheduleState & { reopenWithinSession: boolean } {
  if (outcome === "unclear") return { ...state, reopenWithinSession: false };

  if (outcome === "recall") {
    const gapDays = Math.min(state.gapDays * config.gapGrowth, config.gapCapDays);
    return { ...state, gapDays, nextDueAt: dueAt(at, gapDays), reopenWithinSession: false };
  }

  // outcome === "miss": gap shrinks and the item returns to within-session re-training.
  const gapDays = Math.max(state.gapDays * config.gapShrink, config.gapFloorDays);
  return { ...state, gapDays, nextDueAt: dueAt(at, gapDays), reopenWithinSession: true };
}

/**
 * Booster probe outcome for a mastered target. `unclear` never moves the schedule, as above.
 */
export function onBoosterOutcome(
  state: ScheduleState,
  outcome: Outcome,
  at: number,
  config: SrConfig,
): ScheduleState & { reopenWithinSession: boolean } {
  if (outcome === "unclear") return { ...state, reopenWithinSession: false };

  const lastStep = config.boosterCadenceDays.length - 1;
  const boosterStep =
    outcome === "recall"
      ? Math.min(state.boosterStep + 1, lastStep)
      : Math.max(state.boosterStep - 1, 0);
  const cadenceDays = config.boosterCadenceDays[boosterStep] ?? 0;
  return {
    ...state,
    boosterStep,
    nextDueAt: dueAt(at, cadenceDays),
    reopenWithinSession: outcome === "miss",
  };
}

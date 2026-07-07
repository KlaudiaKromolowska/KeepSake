import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "./config";
import type { ScheduleState } from "./scheduler";
import {
  afterCeilingHandoff,
  afterMastery,
  onBoosterOutcome,
  onSessionStartOutcome,
} from "./scheduler";

const config = DEFAULT_SR_CONFIG;
const DAY_MS = 86_400_000;

function frozen(state: ScheduleState): ScheduleState {
  return Object.freeze(state);
}

/** `noUncheckedIndexedAccess`-safe read of a known-in-range cadence step. */
function cadenceDays(step: number): number {
  return config.boosterCadenceDays[step] ?? 0;
}

describe("afterCeilingHandoff", () => {
  it("opens the first between-session gap at +1 day", () => {
    const state = afterCeilingHandoff(0, config);
    expect(state).toEqual({
      mode: "between",
      gapDays: config.firstGapDays,
      boosterStep: 0,
      nextDueAt: config.firstGapDays * DAY_MS,
    });
  });
});

describe("afterMastery", () => {
  it("starts maintenance boosters at step 0, due at +7 days", () => {
    const state = afterMastery(0, config);
    expect(state).toEqual({
      mode: "booster",
      gapDays: 0,
      boosterStep: 0,
      nextDueAt: cadenceDays(0) * DAY_MS,
    });
  });
});

describe("onSessionStartOutcome — pre-mastery growth walk", () => {
  it("grows the gap ×1.5 on each success, capping at 14 days", () => {
    let state = frozen(afterCeilingHandoff(0, config));
    expect(state.gapDays).toBe(1);

    const step1 = onSessionStartOutcome(state, "recall", DAY_MS, config);
    expect(step1.state.gapDays).toBe(1.5);
    expect(step1.reopenWithinSession).toBe(false);
    expect(step1.state.nextDueAt).toBe(DAY_MS + 1.5 * DAY_MS);
    state = frozen(step1.state);

    const step2 = onSessionStartOutcome(state, "recall", state.nextDueAt, config);
    expect(step2.state.gapDays).toBe(2.25);
    state = frozen(step2.state);

    // Keep growing past the cap — every step is capped at gapCapDays.
    for (let i = 0; i < 10; i++) {
      const next = onSessionStartOutcome(state, "recall", state.nextDueAt, config);
      expect(next.state.gapDays).toBeLessThanOrEqual(config.gapCapDays);
      state = frozen(next.state);
    }
    expect(state.gapDays).toBe(config.gapCapDays);
  });
});

describe("onSessionStartOutcome — failure shrink walk", () => {
  it("halves the gap on failure, flooring at 1 day, and requests reopen", () => {
    let state = frozen({ mode: "between", gapDays: 14, boosterStep: 0, nextDueAt: 0 });

    const step1 = onSessionStartOutcome(state, "miss", 0, config);
    expect(step1.state.gapDays).toBe(7);
    expect(step1.reopenWithinSession).toBe(true);
    state = frozen(step1.state);

    const step2 = onSessionStartOutcome(state, "miss", 0, config);
    expect(step2.state.gapDays).toBe(3.5);
    state = frozen(step2.state);

    // Keep shrinking past the floor — never below gapFloorDays.
    for (let i = 0; i < 10; i++) {
      const next = onSessionStartOutcome(state, "miss", 0, config);
      expect(next.state.gapDays).toBeGreaterThanOrEqual(config.gapFloorDays);
      expect(next.reopenWithinSession).toBe(true);
      state = frozen(next.state);
    }
    expect(state.gapDays).toBe(config.gapFloorDays);
  });
});

describe("onSessionStartOutcome — unclear", () => {
  it("is a strict no-op in between mode: same state reference, no reopen", () => {
    const state = frozen(afterCeilingHandoff(0, config));
    const result = onSessionStartOutcome(state, "unclear", DAY_MS, config);
    // `unclear` is a pure no-op — the returned state is the SAME object reference as the input,
    // not just an equal copy.
    expect(result.state).toBe(state);
    expect(result.reopenWithinSession).toBe(false);
  });
});

describe("onBoosterOutcome — success walk", () => {
  it("advances the cadence 7 -> 14 -> 30 -> 90, then clamps at 90", () => {
    let state = frozen(afterMastery(0, config));
    expect(state.boosterStep).toBe(0);

    const s1 = onBoosterOutcome(state, "recall", 0, config);
    expect(s1.state.boosterStep).toBe(1);
    expect(s1.state.nextDueAt).toBe(cadenceDays(1) * DAY_MS);
    expect(s1.reopenWithinSession).toBe(false);
    state = frozen(s1.state);

    const s2 = onBoosterOutcome(state, "recall", 0, config);
    expect(s2.state.boosterStep).toBe(2);
    state = frozen(s2.state);

    const s3 = onBoosterOutcome(state, "recall", 0, config);
    expect(s3.state.boosterStep).toBe(3);
    expect(s3.state.nextDueAt).toBe(cadenceDays(3) * DAY_MS);
    state = frozen(s3.state);

    // Already at the last step — success clamps, repeating the 90d cadence.
    const s4 = onBoosterOutcome(state, "recall", 0, config);
    expect(s4.state.boosterStep).toBe(3);
    expect(s4.state.nextDueAt).toBe(cadenceDays(3) * DAY_MS);
  });
});

describe("onBoosterOutcome — miss drops one cadence step", () => {
  it("drops from step 2 to step 1 (+14d) and requests reopen", () => {
    const state = frozen({ mode: "booster", gapDays: 0, boosterStep: 2, nextDueAt: 0 });
    const result = onBoosterOutcome(state, "miss", 0, config);
    expect(result.state.boosterStep).toBe(1);
    expect(result.state.nextDueAt).toBe(cadenceDays(1) * DAY_MS);
    expect(result.reopenWithinSession).toBe(true);
  });

  it("stays at step 0 on a miss (never below step 0)", () => {
    const state = frozen(afterMastery(0, config));
    const result = onBoosterOutcome(state, "miss", 0, config);
    expect(result.state.boosterStep).toBe(0);
    expect(result.state.nextDueAt).toBe(cadenceDays(0) * DAY_MS);
    expect(result.reopenWithinSession).toBe(true);
  });
});

describe("onBoosterOutcome — unclear", () => {
  it("is a strict no-op: same state reference, no reopen", () => {
    const state = frozen(afterMastery(0, config));
    const result = onBoosterOutcome(state, "unclear", DAY_MS, config);
    expect(result.state).toBe(state);
    expect(result.reopenWithinSession).toBe(false);
  });
});

describe("purity", () => {
  it("never mutates the input state or config", () => {
    const state = Object.freeze(afterCeilingHandoff(0, Object.freeze({ ...config })));
    expect(() => onSessionStartOutcome(state, "recall", DAY_MS, config)).not.toThrow();
    expect(() => onSessionStartOutcome(state, "miss", DAY_MS, config)).not.toThrow();
  });
});

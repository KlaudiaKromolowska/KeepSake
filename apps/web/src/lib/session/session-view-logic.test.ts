import type { SessionState } from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import type { ActionResult } from "@/lib/actions";
import { attemptSave, recallCount, screenForPhase, trialAdded } from "./session-view-logic";

/** Minimal SessionState stub — only the fields these pure helpers read. */
function state(overrides: Partial<SessionState> = {}): SessionState {
  return {
    phase: "distractor",
    intervalSec: 15,
    baseMisses: 0,
    unclearRun: 0,
    startedAt: 1,
    startedDay: "2026-07-08",
    timeZone: "UTC",
    isStartProbe: false,
    progress: {
      lastSuccessSec: null,
      startStreak: 0,
      lastStartSuccessDay: null,
      badSessions: 0,
      mastered: false,
      sessionCount: 1,
    },
    trials: [],
    endReason: null,
    handoffToScheduler: false,
    rescopeRequired: false,
    ...overrides,
  };
}

const trial = (outcome: "recall" | "miss" | "unclear") => ({
  intervalSec: 15,
  outcome,
  isScreening: false,
  corrected: false,
  at: 1,
});

describe("trialAdded", () => {
  it("is true only when the next state has more trials than the previous", () => {
    const prev = state({ trials: [trial("recall")] });
    const next = state({ trials: [trial("recall"), trial("miss")] });
    expect(trialAdded(prev, next)).toBe(true);
  });

  it("is false when the trial count is unchanged (e.g. a phase-only transition)", () => {
    const prev = state({ trials: [trial("recall")], phase: "distractor" });
    const next = state({ trials: [trial("recall")], phase: "awaiting_probe" });
    expect(trialAdded(prev, next)).toBe(false);
  });

  it("is false when the count somehow shrinks (never treated as an add)", () => {
    const prev = state({ trials: [trial("recall"), trial("miss")] });
    const next = state({ trials: [trial("recall")] });
    expect(trialAdded(prev, next)).toBe(false);
  });
});

describe("recallCount", () => {
  it("counts only trials whose outcome is recall", () => {
    expect(recallCount([trial("recall"), trial("miss"), trial("recall"), trial("unclear")])).toBe(
      2,
    );
  });

  it("is 0 for an empty trial list", () => {
    expect(recallCount([])).toBe(0);
  });
});

describe("attemptSave", () => {
  it("returns true when the action resolves with no error", async () => {
    const fn = async (): Promise<ActionResult<null>> => ({ data: null, error: null });
    expect(await attemptSave(fn)).toBe(true);
  });

  it("returns false when the action resolves with an error", async () => {
    const fn = async (): Promise<ActionResult<null>> => ({ data: null, error: "boom" });
    expect(await attemptSave(fn)).toBe(false);
  });

  it("returns false — not a throw — when the action rejects", async () => {
    const fn = async (): Promise<ActionResult<null>> => {
      throw new Error("network drop");
    };
    await expect(attemptSave(fn)).resolves.toBe(false);
  });
});

describe("screenForPhase", () => {
  it("maps each engine phase to its screen key", () => {
    expect(screenForPhase("teach")).toBe("teach");
    expect(screenForPhase("awaiting_probe")).toBe("probe");
    expect(screenForPhase("correcting")).toBe("correction");
    expect(screenForPhase("distractor")).toBe("distractor");
    expect(screenForPhase("end_on_win")).toBe("end_on_win");
    expect(screenForPhase("ended")).toBe("ended");
  });
});

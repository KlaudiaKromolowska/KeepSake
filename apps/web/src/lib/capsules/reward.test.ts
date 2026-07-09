import type { SessionState, TrialRecord } from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import { type Capsule, isRewardableRecall, selectCapsule } from "./reward";

/** Minimal SessionState carrying only the field the reward logic reads (`trials`). */
const stateWith = (trials: Partial<TrialRecord>[]): SessionState =>
  ({ trials: trials.map((t) => ({ intervalSec: 0, at: 0, ...t }) as TrialRecord) }) as SessionState;

const recall = (over: Partial<TrialRecord> = {}): Partial<TrialRecord> => ({
  outcome: "recall",
  isScreening: false,
  corrected: false,
  ...over,
});

const capsules: Capsule[] = [
  { id: "a", kind: "photo", caption: null, url: "https://s/a" },
  { id: "b", kind: "video", caption: "grandkids", url: "https://s/b" },
  { id: "c", kind: "photo", caption: null, url: "https://s/c" },
];

describe("isRewardableRecall", () => {
  it("true when the transition adds a genuine, uncorrected, non-screening recall", () => {
    const prev = stateWith([recall()]);
    const next = stateWith([recall(), recall()]);
    expect(isRewardableRecall(prev, next)).toBe(true);
  });

  it("false when no new trial was added this transition", () => {
    const s = stateWith([recall()]);
    expect(isRewardableRecall(s, s)).toBe(false);
    // A phase-only change (same trials array length) never rewards.
    expect(isRewardableRecall(stateWith([recall()]), stateWith([recall()]))).toBe(false);
  });

  it("false for a miss", () => {
    const prev = stateWith([]);
    const next = stateWith([recall({ outcome: "miss", corrected: true })]);
    expect(isRewardableRecall(prev, next)).toBe(false);
  });

  it("false for an unclear", () => {
    const prev = stateWith([]);
    const next = stateWith([recall({ outcome: "unclear" })]);
    expect(isRewardableRecall(prev, next)).toBe(false);
  });

  it("false for the errorless-correction / teach / end-on-win repeat (corrected recall)", () => {
    const prev = stateWith([]);
    const next = stateWith([recall({ corrected: true })]);
    expect(isRewardableRecall(prev, next)).toBe(false);
  });

  it("false for a screening-trial recall", () => {
    const prev = stateWith([]);
    const next = stateWith([recall({ isScreening: true })]);
    expect(isRewardableRecall(prev, next)).toBe(false);
  });

  it("evaluates only the newest trial, not earlier ones", () => {
    // Earlier miss present; the just-added trial is a genuine recall → reward.
    const prev = stateWith([recall({ outcome: "miss", corrected: true })]);
    const next = stateWith([recall({ outcome: "miss", corrected: true }), recall()]);
    expect(isRewardableRecall(prev, next)).toBe(true);
  });
});

describe("selectCapsule", () => {
  it("returns null when there are no capsules (graceful absence)", () => {
    expect(selectCapsule([], 0)).toBeNull();
    expect(selectCapsule([], 5)).toBeNull();
  });

  it("rotates deterministically through the set by reward index", () => {
    expect(selectCapsule(capsules, 0)?.id).toBe("a");
    expect(selectCapsule(capsules, 1)?.id).toBe("b");
    expect(selectCapsule(capsules, 2)?.id).toBe("c");
    expect(selectCapsule(capsules, 3)?.id).toBe("a"); // wraps
    expect(selectCapsule(capsules, 4)?.id).toBe("b");
  });

  it("is deterministic (same index → same capsule, no RNG)", () => {
    expect(selectCapsule(capsules, 7)?.id).toBe(selectCapsule(capsules, 7)?.id);
  });

  it("handles a negative index safely", () => {
    expect(selectCapsule(capsules, -1)?.id).toBe("c");
  });
});

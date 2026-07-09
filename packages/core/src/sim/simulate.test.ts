import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "../sr/config";
import { defaultsForEtiology } from "../sr/etiology";
import type { TargetProgress } from "../sr/session";
import { startSession } from "../sr/session";
import { initialStrengthSec } from "./memoryModel";
import type { Rng } from "./rng";
import { createRng } from "./rng";
import type { MemoryRef } from "./simulate";
import { driveSession, simulatePatient, simulatePopulation } from "./simulate";

const N = 300;
const SEED = 42;
const HORIZON_DAYS = 90;

describe("simulatePopulation — determinism", () => {
  it("the same seed reproduces the exact same population result", () => {
    const a = simulatePopulation({ n: N, seed: SEED, horizonDays: HORIZON_DAYS });
    const b = simulatePopulation({ n: N, seed: SEED, horizonDays: HORIZON_DAYS });
    expect(a).toEqual(b);
  });

  it("different seeds produce a different population result", () => {
    const a = simulatePopulation({ n: N, seed: SEED, horizonDays: HORIZON_DAYS });
    const b = simulatePopulation({ n: N, seed: SEED + 1, horizonDays: HORIZON_DAYS });
    expect(a).not.toEqual(b);
  });

  it("defaults the horizon to 90 days when omitted", () => {
    const withDefault = simulatePopulation({ n: 20, seed: SEED });
    const explicit = simulatePopulation({ n: 20, seed: SEED, horizonDays: 90 });
    expect(withDefault).toEqual(explicit);
  });
});

describe("simulatePopulation — invariants", () => {
  const results = simulatePopulation({ n: N, seed: SEED, horizonDays: HORIZON_DAYS });
  let masteredCount = 0;
  let notCandidateCount = 0;

  it("every within-session trial interval stays within [baseIntervalSec, maxIntervalSec]", () => {
    for (const r of results) {
      const { config } = defaultsForEtiology(r.etiology);
      for (const sec of r.trialIntervalsSec) {
        expect(sec).toBeGreaterThanOrEqual(config.baseIntervalSec);
        expect(sec).toBeLessThanOrEqual(config.maxIntervalSec);
      }
    }
  });

  it("mastery requires at least masteryStreak + 1 sessions (1 teach + >= 3 start-probe recalls)", () => {
    for (const r of results) {
      if (r.status !== "mastered") continue;
      masteredCount++;
      const { config } = defaultsForEtiology(r.etiology);
      expect(r.sessionsToMastery).not.toBeNull();
      expect(r.sessionsToMastery as number).toBeGreaterThanOrEqual(config.masteryStreak + 1);
      expect(r.masteredAtMs).not.toBeNull();
      expect(r.daysToMastery).not.toBeNull();
      expect(r.daysToMastery as number).toBeGreaterThanOrEqual(0);
      expect(r.daysToMastery as number).toBeLessThanOrEqual(HORIZON_DAYS);
    }
    // Sanity: with 300 patients and a nontrivial recall model, some should master within 90 days.
    expect(masteredCount).toBeGreaterThan(0);
  });

  it("a patient who failed candidacy never accrues acquisition data", () => {
    for (const r of results) {
      if (r.candidacyPassed) continue;
      notCandidateCount++;
      expect(r.status).toBe("not_candidate");
      expect(r.sessionCount).toBe(0);
      expect(r.trialIntervalsSec).toEqual([]);
      expect(r.boosterChecks).toEqual([]);
      expect(r.sessionsToMastery).toBeNull();
      expect(r.masteredAtMs).toBeNull();
    }
    expect(notCandidateCount).toBeGreaterThanOrEqual(0);
  });

  it("candidacyLevelReached is within [0, candidacyLevelsSec.length]", () => {
    for (const r of results) {
      const { config } = defaultsForEtiology(r.etiology);
      expect(r.candidacyLevelReached).toBeGreaterThanOrEqual(0);
      expect(r.candidacyLevelReached).toBeLessThanOrEqual(config.candidacyLevelsSec.length);
    }
  });

  it("booster/between check timestamps are non-decreasing per patient", () => {
    for (const r of results) {
      for (let i = 1; i < r.boosterChecks.length; i++) {
        const prev = r.boosterChecks[i - 1];
        const cur = r.boosterChecks[i];
        if (prev && cur) expect(cur.atMs).toBeGreaterThanOrEqual(prev.atMs);
      }
    }
  });

  it("a rescoped patient is never simultaneously reported as mastered", () => {
    for (const r of results) {
      if (r.status === "rescoped") {
        expect(r.masteredAtMs).toBeNull();
      }
    }
  });
});

describe("simulatePatient", () => {
  it("a patient with ability 0 in the fastest-decay etiology can still complete a run without throwing", () => {
    const rng = createRng(1);
    const patient = { id: 0, etiology: "lewy" as const, ability: 0 };
    const { config } = defaultsForEtiology(patient.etiology);
    expect(() => simulatePatient(patient, rng, config, 90)).not.toThrow();
  });

  it("a patient with ability near 1 in the slowest-decay etiology can still complete a run without throwing", () => {
    const rng = createRng(2);
    const patient = { id: 0, etiology: "alzheimers" as const, ability: 0.999 };
    const { config } = defaultsForEtiology(patient.etiology);
    expect(() => simulatePatient(patient, rng, config, 90)).not.toThrow();
  });
});

describe("driveSession — start-probe outcome resolution", () => {
  /** Feeds a scripted sequence to every `bool()` call in draw order, ignoring the requested
   *  probability — lets a test dictate exact recall/unclear outcomes regardless of the memory
   *  model's actual curve. `next`/`int`/`pick` are unused by `drawOutcome` and left unimplemented. */
  function scriptedBoolRng(sequence: readonly boolean[]): Rng {
    let i = 0;
    return {
      next: () => {
        throw new Error("scriptedBoolRng: next() not supported");
      },
      int: () => {
        throw new Error("scriptedBoolRng: int() not supported");
      },
      bool: () => {
        const v = sequence[i++];
        if (v === undefined) throw new Error("scriptedBoolRng: sequence exhausted");
        return v;
      },
      pick: <T>(items: readonly T[]) => {
        const item = items[0];
        if (item === undefined) throw new Error("scriptedBoolRng: pick() on empty array");
        return item;
      },
    };
  }

  it('resolves a terminal double-unclear start probe to "miss", not the raw last-drawn "unclear"', () => {
    const config = DEFAULT_SR_CONFIG;
    const progress: TargetProgress = {
      lastSuccessSec: null,
      startStreak: 0,
      lastStartSuccessDay: null,
      badSessions: 0,
      mastered: false,
      sessionCount: 3, // not the first session → isStartProbe true
    };
    const started = startSession(progress, { at: 0, timeZone: "UTC" }, config);
    const memoryRef: MemoryRef = {
      memory: initialStrengthSec(0.5, "alzheimers"),
      lastExposureAtMs: 0,
    };
    // unclear, unclear (double-unclear → confirmed miss), then 7 forced recalls walking the
    // ladder 15→30→60→120→240→480→960 up to the ceiling so the session terminates cleanly.
    const rng = scriptedBoolRng([
      true,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);

    const result = driveSession(started, config, memoryRef, 0.5, rng);

    expect(result.session.phase).toBe("ended");
    expect(result.session.endReason).toBe("ceiling");
    expect(result.session.trials[0]).toMatchObject({
      intervalSec: 0,
      outcome: "unclear",
      corrected: false,
    });
    expect(result.session.trials[1]).toMatchObject({
      intervalSec: 0,
      outcome: "unclear",
      corrected: true,
    });
    // Pre-fix, this read the raw last-drawn per-probe outcome ("unclear") straight off the wire —
    // silently no-opping the scheduler dispatch on a confirmed start-probe miss.
    expect(result.startProbeOutcome).toBe("miss");
  });
});

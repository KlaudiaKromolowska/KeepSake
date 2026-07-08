import { describe, expect, it } from "vitest";
import { defaultsForEtiology } from "../sr/etiology";
import { createRng } from "./rng";
import { simulatePatient, simulatePopulation } from "./simulate";

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

import { describe, expect, it } from "vitest";
import { simulatePopulation } from "../sim/simulate";
import { DEFAULT_SR_CONFIG, type SrConfig } from "./config";
import { defaultsForEtiology } from "./etiology";
import { isAtCeiling, nextIntervalSec, resetIntervalSec } from "./ladder";
import {
  derivePopulationPrior,
  ladderRungsBelowCeiling,
  MIN_PRIOR_SAMPLE,
  type PopulationPrior,
  type PriorSample,
  snapDownToRung,
  WARM_START_PERCENTILE,
  warmStartConfig,
  warmStartDefaults,
} from "./populationPrior";
import { POPULATION_PRIOR } from "./populationPrior.data";
import { type SessionState, sessionReduce, startSession } from "./session";
import type { Etiology } from "./types";

const META = { n: 100, seed: 42, horizonDays: 90, generatedAt: "2026-01-01T00:00:00.000Z" };

/** Builds `count` mastered samples for `etiology`, all with the same trial-interval vector. */
function masteredSamples(
  etiology: Etiology,
  count: number,
  trialIntervalsSec: number[],
): PriorSample[] {
  return Array.from({ length: count }, () => ({ etiology, status: "mastered", trialIntervalsSec }));
}

describe("ladderRungsBelowCeiling", () => {
  it("lists base, base×g, … strictly below the ceiling (ceiling excluded)", () => {
    // base 15, g 2, ceiling 960 → 15,30,60,120,240,480 (960 is the handoff ceiling, not an opening)
    expect(ladderRungsBelowCeiling(DEFAULT_SR_CONFIG)).toEqual([15, 30, 60, 120, 240, 480]);
  });

  it("handles a fractional-growth ladder (base 15, g 1.5)", () => {
    const cfg: SrConfig = { ...DEFAULT_SR_CONFIG, growthFactor: 1.5 };
    const rungs = ladderRungsBelowCeiling(cfg);
    expect(rungs[0]).toBe(15);
    expect(rungs).toContain(50.625); // 15 × 1.5³
    expect(rungs.every((r) => r < cfg.maxIntervalSec)).toBe(true);
  });
});

describe("snapDownToRung", () => {
  it("snaps down to the largest rung ≤ the value", () => {
    expect(snapDownToRung(65, DEFAULT_SR_CONFIG)).toBe(60);
    expect(snapDownToRung(60, DEFAULT_SR_CONFIG)).toBe(60); // exact rung stays
    expect(snapDownToRung(119, DEFAULT_SR_CONFIG)).toBe(60);
  });

  it("clamps up to the base for sub-base values (never below the evidence-based floor)", () => {
    expect(snapDownToRung(3, DEFAULT_SR_CONFIG)).toBe(15);
    expect(snapDownToRung(0, DEFAULT_SR_CONFIG)).toBe(15);
  });

  it("clamps down to the last below-ceiling rung for huge values", () => {
    expect(snapDownToRung(100_000, DEFAULT_SR_CONFIG)).toBe(480);
  });
});

describe("derivePopulationPrior — aggregation", () => {
  it("computes the p25 within-session interval, snapped to a rung, per etiology", () => {
    // Intervals 15,30,60,120 → p25 (nearest-rank at floor(0.25×4)=1) = 30. Rung 30 exists → 30.
    const samples = masteredSamples("vascular", 40, [15, 30, 60, 120]);
    const prior = derivePopulationPrior(samples, META);
    const entry = prior.byEtiology.vascular;
    expect(entry).toBeDefined();
    expect(entry?.rawPercentileSec).toBe(30);
    expect(entry?.startIntervalSec).toBe(30);
    expect(entry?.sampleSize).toBe(40);
  });

  it("ignores non-mastered patients (only the settled cohort counts)", () => {
    const samples: PriorSample[] = [
      ...masteredSamples("vascular", MIN_PRIOR_SAMPLE, [60, 120, 240, 480]),
      // rescoped/acquiring patients thrash at the base — must not drag the prior down.
      ...Array.from({ length: 50 }, () => ({
        etiology: "vascular" as Etiology,
        status: "rescoped",
        trialIntervalsSec: [15, 15, 15],
      })),
    ];
    const prior = derivePopulationPrior(samples, META);
    // p25 of the mastered-only pool [60,120,240,480] = 120, not pulled toward 15 by the rescoped.
    expect(prior.byEtiology.vascular?.rawPercentileSec).toBe(120);
    expect(prior.byEtiology.vascular?.sampleSize).toBe(MIN_PRIOR_SAMPLE);
  });

  it("emits no entry (→ fallback) when the mastered sample is below MIN_PRIOR_SAMPLE", () => {
    const prior = derivePopulationPrior(
      masteredSamples("lewy", MIN_PRIOR_SAMPLE - 1, [15, 30]),
      META,
    );
    expect(prior.byEtiology.lewy).toBeUndefined();
  });

  it("emits no entry when mastered patients logged no within-session trials", () => {
    const prior = derivePopulationPrior(masteredSamples("mixed", 30, []), META);
    expect(prior.byEtiology.mixed).toBeUndefined();
  });

  it("stamps provenance meta (percentile, minSample, default honesty source)", () => {
    const prior = derivePopulationPrior(masteredSamples("vascular", 30, [15, 30, 60]), META);
    expect(prior.meta.percentile).toBe(WARM_START_PERCENTILE);
    expect(prior.meta.minSample).toBe(MIN_PRIOR_SAMPLE);
    expect(prior.meta.seed).toBe(42);
    expect(prior.meta.source).toMatch(/prior, not proof/i);
  });
});

describe("warmStartConfig — semantics-preserving application", () => {
  it("returns the config unchanged when there is no prior (cold-start fallback)", () => {
    expect(warmStartConfig(DEFAULT_SR_CONFIG, undefined)).toBe(DEFAULT_SR_CONFIG);
  });

  it("raises ONLY baseIntervalSec — every other field is byte-for-byte identical", () => {
    const warmed = warmStartConfig(DEFAULT_SR_CONFIG, {
      startIntervalSec: 60,
      sampleSize: 40,
      rawPercentileSec: 60,
    });
    expect(warmed.baseIntervalSec).toBe(60);
    // Prove nothing else moved: restore the base and the object must equal the default exactly.
    expect({ ...warmed, baseIntervalSec: DEFAULT_SR_CONFIG.baseIntervalSec }).toEqual(
      DEFAULT_SR_CONFIG,
    );
  });

  it("never LOWERS the base (a prior at/below base is a no-op)", () => {
    expect(
      warmStartConfig(DEFAULT_SR_CONFIG, {
        startIntervalSec: 15,
        sampleSize: 40,
        rawPercentileSec: 15,
      }),
    ).toBe(DEFAULT_SR_CONFIG);
    expect(
      warmStartConfig(DEFAULT_SR_CONFIG, {
        startIntervalSec: 5,
        sampleSize: 40,
        rawPercentileSec: 5,
      }),
    ).toBe(DEFAULT_SR_CONFIG);
  });

  it("re-clamps a stale/over-large prior to the last below-ceiling rung (never reaches ceiling)", () => {
    const warmed = warmStartConfig(DEFAULT_SR_CONFIG, {
      startIntervalSec: 5000,
      sampleSize: 40,
      rawPercentileSec: 5000,
    });
    expect(warmed.baseIntervalSec).toBe(480); // last rung below the 960 ceiling
    expect(warmed.baseIntervalSec).toBeLessThan(warmed.maxIntervalSec);
  });
});

describe("warmStartConfig — the deterministic ladder is unchanged around the raised base", () => {
  const warmed = warmStartConfig(DEFAULT_SR_CONFIG, {
    startIntervalSec: 60,
    sampleSize: 40,
    rawPercentileSec: 60,
  });

  it("growth, ceiling and revert-floor still follow the same rules off the new base", () => {
    expect(nextIntervalSec(60, warmed)).toBe(120); // ×growthFactor, unchanged
    expect(nextIntervalSec(480, warmed)).toBe(960); // caps at the (unchanged) ceiling
    expect(isAtCeiling(960, warmed)).toBe(true);
    // With no prior success, the revert floor is the (raised) base — the ladder's own rule.
    expect(resetIntervalSec(null, warmed)).toBe(60);
    // Growth factor and mastery streak untouched by the prior.
    expect(warmed.growthFactor).toBe(DEFAULT_SR_CONFIG.growthFactor);
    expect(warmed.masteryStreak).toBe(DEFAULT_SR_CONFIG.masteryStreak);
  });

  it("the rescope safety valve still fires at the raised floor (base-miss counting keys off it)", () => {
    // Drive a first session: teach → open at base(60) → miss → correct → revert to 60 (not > base)
    // → base miss #1 → miss again → base miss #2 == baseMissesToEnd → struggle close, badSessions++.
    const progress = {
      lastSuccessSec: null,
      startStreak: 0,
      lastStartSuccessDay: null,
      badSessions: 0,
      mastered: false,
      sessionCount: 0,
    };
    let s: SessionState = startSession(progress, { at: 0, timeZone: "UTC" }, warmed);
    s = sessionReduce(s, { type: "teach_done", at: 1 }, warmed); // → distractor at base 60
    expect(s.intervalSec).toBe(60); // opened at the warm-start floor, not 15
    const missOnce = (state: SessionState, at: number): SessionState => {
      let n = sessionReduce(state, { type: "wait_elapsed", at }, warmed); // → awaiting_probe
      n = sessionReduce(n, { type: "probe_result", outcome: "miss", at }, warmed); // → correcting
      return sessionReduce(n, { type: "correction_done", at }, warmed);
    };
    s = missOnce(s, 2);
    expect(s.baseMisses).toBe(1); // reverted to 60 == base → counted as a base miss
    s = missOnce(s, 3);
    expect(s.endReason).toBe("struggle");
    expect(s.progress.badSessions).toBe(1);
  });
});

describe("warmStartDefaults — opt-in consumer", () => {
  const et: Etiology = "vascular";
  const prior: PopulationPrior = {
    meta: { ...META, percentile: 0.25, minSample: 20, source: "test" },
    byEtiology: { vascular: { startIntervalSec: 60, sampleSize: 40, rawPercentileSec: 60 } },
  };

  it("with no prior, equals defaultsForEtiology exactly (fallback preserved)", () => {
    expect(warmStartDefaults(et)).toEqual(defaultsForEtiology(et));
    expect(warmStartDefaults(et, undefined)).toEqual(defaultsForEtiology(et));
  });

  it("falls back for an etiology absent from the prior table", () => {
    expect(warmStartDefaults("alzheimers", prior)).toEqual(defaultsForEtiology("alzheimers"));
  });

  it("raises the base for an etiology present in the prior; answerFormat untouched", () => {
    const warmed = warmStartDefaults(et, prior);
    expect(warmed.config.baseIntervalSec).toBe(60);
    expect(warmed.answerFormat).toBe(defaultsForEtiology(et).answerFormat);
  });

  it("never mutates the shared defaults", () => {
    warmStartDefaults(et, prior);
    expect(defaultsForEtiology(et).config.baseIntervalSec).toBe(DEFAULT_SR_CONFIG.baseIntervalSec);
  });
});

describe("committed POPULATION_PRIOR artifact", () => {
  it("only ever raises the base to a real, below-ceiling rung of that etiology's config", () => {
    for (const [etiology, entry] of Object.entries(POPULATION_PRIOR.byEtiology)) {
      if (!entry) continue;
      const { config } = defaultsForEtiology(etiology as Etiology);
      expect(ladderRungsBelowCeiling(config)).toContain(entry.startIntervalSec);
      expect(entry.startIntervalSec).toBeGreaterThanOrEqual(config.baseIntervalSec);
      expect(entry.startIntervalSec).toBeLessThan(config.maxIntervalSec);
      expect(entry.sampleSize).toBeGreaterThanOrEqual(MIN_PRIOR_SAMPLE);
    }
  });

  it("is up to date — matches a fresh regeneration from its own seed (determinism guard)", () => {
    const results = simulatePopulation({
      n: POPULATION_PRIOR.meta.n,
      seed: POPULATION_PRIOR.meta.seed,
      horizonDays: POPULATION_PRIOR.meta.horizonDays,
    });
    const fresh = derivePopulationPrior(results, {
      n: POPULATION_PRIOR.meta.n,
      seed: POPULATION_PRIOR.meta.seed,
      horizonDays: POPULATION_PRIOR.meta.horizonDays,
      generatedAt: POPULATION_PRIOR.meta.generatedAt,
    });
    expect(fresh.byEtiology).toEqual(POPULATION_PRIOR.byEtiology);
  });

  it("regeneration is deterministic (same seed → identical priors)", () => {
    const opts = { n: 300, seed: 7, horizonDays: 90 };
    const a = derivePopulationPrior(simulatePopulation(opts), {
      ...opts,
      generatedAt: META.generatedAt,
    });
    const b = derivePopulationPrior(simulatePopulation(opts), {
      ...opts,
      generatedAt: META.generatedAt,
    });
    expect(a).toEqual(b);
  });
});

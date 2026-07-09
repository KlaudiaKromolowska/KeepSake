import {
  defaultsForEtiology,
  POPULATION_PRIOR,
  type PopulationPrior,
  warmStartDefaults,
} from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import { srDefaultsForPatient } from "./config";

describe("srDefaultsForPatient", () => {
  it("opens a new target at the etiology's warm-start rung, not the generic cold-start base", () => {
    // alzheimers has a committed prior (50.625s) that is strictly above its cold-start base (15s).
    const cold = defaultsForEtiology("alzheimers").config.baseIntervalSec;
    const warm = srDefaultsForPatient("alzheimers").config.baseIntervalSec;
    expect(warm).toBe(50.625);
    expect(warm).toBeGreaterThan(cold);
  });

  it("uses the exact committed POPULATION_PRIOR — bit-identical, no round-trip drift", () => {
    // The whole point of recompute-at-load: the fractional warm-start base is produced from the
    // same literal every time, never persisted through a numeric column. Object.is catches any
    // float drift (e.g. a jsonb/numeric round-trip) that === would still accept for most values.
    for (const et of [
      "alzheimers",
      "lewy",
      "parkinsons",
      "vascular",
      "mixed",
      "unspecified",
    ] as const) {
      const expected = warmStartDefaults(et, POPULATION_PRIOR).config.baseIntervalSec;
      expect(Object.is(srDefaultsForPatient(et).config.baseIntervalSec, expected)).toBe(true);
    }
  });

  it("falls back to the generic cold-start base for an etiology with no prior", () => {
    // Strip the prior so the etiology has no entry — the warmStartDefaults contract the wiring
    // relies on must return the unmodified cold-start config.
    const noPrior: PopulationPrior = { ...POPULATION_PRIOR, byEtiology: {} };
    const fell = srDefaultsForPatient("alzheimers", noPrior);
    expect(fell.config.baseIntervalSec).toBe(
      defaultsForEtiology("alzheimers").config.baseIntervalSec,
    );
    expect(fell).toEqual(defaultsForEtiology("alzheimers"));
  });

  it("only raises baseIntervalSec — growth, ceiling, and answer format are the etiology defaults", () => {
    const warm = srDefaultsForPatient("alzheimers");
    const cold = defaultsForEtiology("alzheimers");
    expect(warm.answerFormat).toBe(cold.answerFormat);
    expect(warm.config.growthFactor).toBe(cold.config.growthFactor);
    expect(warm.config.maxIntervalSec).toBe(cold.config.maxIntervalSec);
  });
});

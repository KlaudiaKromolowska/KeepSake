// GENERATED FILE — do not edit by hand. Regenerate with `pnpm gen:prior`.
//
// Per-etiology starting-interval prior, derived from the in-silico population simulation
// (packages/core/src/sim, docs/simulation). PRIOR, NOT PROOF: aggregated from an illustrative
// synthetic memory model, never from patient data. See populationPrior.ts for the honest-framing
// docstring, the aggregation method (p25 of mastered patients' within-session intervals, snapped to
// a ladder rung), and how it is consumed (raising baseIntervalSec — the deterministic ladder is
// unchanged).
import type { PopulationPrior } from "./populationPrior";

export const POPULATION_PRIOR: PopulationPrior = {
  meta: {
    n: 1000,
    seed: 42,
    horizonDays: 90,
    generatedAt: "2026-07-09T09:07:42.472Z",
    percentile: 0.25,
    minSample: 20,
    source:
      "Derived from the in-silico synthetic-cohort simulation (docs/simulation) — prior, not proof; not patient data.",
  },
  byEtiology: {
    vascular: {
      startIntervalSec: 60,
      sampleSize: 36,
      rawPercentileSec: 60,
    },
    alzheimers: {
      startIntervalSec: 50.625,
      sampleSize: 59,
      rawPercentileSec: 50.625,
    },
    lewy: {
      startIntervalSec: 33.75,
      sampleSize: 34,
      rawPercentileSec: 33.75,
    },
    unspecified: {
      startIntervalSec: 60,
      sampleSize: 45,
      rawPercentileSec: 60,
    },
    parkinsons: {
      startIntervalSec: 33.75,
      sampleSize: 38,
      rawPercentileSec: 33.75,
    },
    mixed: {
      startIntervalSec: 60,
      sampleSize: 27,
      rawPercentileSec: 60,
    },
  },
};

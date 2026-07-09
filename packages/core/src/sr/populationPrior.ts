import type { SrConfig } from "./config";
import { defaultsForEtiology, type EtiologyDefaults } from "./etiology";
import type { Etiology } from "./types";

/**
 * Population-prior scheduler (PLAN.md §5 — "where ML earns its place").
 *
 * HONEST FRAMING — prior, not proof. This is a **starting-interval prior** derived from the
 * in-silico population simulation (`packages/core/src/sim`, `docs/simulation/`), NOT from patient
 * data and NOT a per-trial ML scheduler. The core stays the deterministic doubling/halving ladder;
 * FSRS-style ML is explicitly rejected as the core (CLAUDE.md / PLAN.md §1). The only thing this
 * prior does is pick a smarter *opening rung* for a brand-new target of a given etiology, instead
 * of always cold-starting at the generic `baseIntervalSec`. Everything downstream — growth, revert,
 * ceiling, mastery, boosters, the rescope safety valve — is unchanged.
 *
 * Every number here is derived from a *deliberately illustrative synthetic memory model*, not fit
 * to any dataset, not peer-reviewed, not a claim about real recall (mirror the tone of
 * `docs/simulation/README.md`). Treat the prior as "the engine's own simulated cohort suggests this
 * etiology reliably operates a couple of rungs above cold-start," never as clinical evidence.
 *
 * WHY THIS IS SAFE (semantics unchanged): the prior is consumed by *raising* `baseIntervalSec` to a
 * warm-start rung — never by injecting an off-ladder interval or touching any reducer. Because
 * `baseIntervalSec` is simultaneously the opening rung, the revert floor, AND the base-miss
 * threshold, raising it keeps the whole ladder/rescope machine internally consistent: a fresh
 * target that genuinely can't hold the warm-start interval reverts to it, counts base misses there,
 * and rescopes exactly as a cold-start target that can't hold 15s would. See `warmStartConfig`.
 */

/** The within-session percentile used as the warm-start interval. Deliberately conservative: the
 *  25th percentile of the settled band sits *below* the median interval the cohort held (so a fresh
 *  target still has real climb headroom and the errorless floor isn't set punishingly high), while
 *  still landing 2–4× above the 10–15s cold-start base. A higher percentile would open too close to
 *  where practised patients ended up — aggressive for a target the patient has never seen. */
export const WARM_START_PERCENTILE = 0.25;

/** Minimum mastered-patient sample for an etiology to earn a prior. Below this we distrust the
 *  aggregate and fall back to the cold-start default — the same "no prior → generic default"
 *  contract the consumer relies on. */
export const MIN_PRIOR_SAMPLE = 20;

/** One etiology's derived starting-interval prior. */
export interface EtiologyPrior {
  /** Warm-start opening rung, seconds — a real ladder rung of that etiology's config, ≥ its base
   *  and strictly below its ceiling. This becomes the new `baseIntervalSec` when applied. */
  startIntervalSec: number;
  /** Number of mastered synthetic patients this etiology's prior was aggregated over. */
  sampleSize: number;
  /** The raw p25 within-session interval (seconds) before snapping to a rung — kept for provenance
   *  so the artifact is auditable. */
  rawPercentileSec: number;
}

/** Provenance of a generated prior — enough to reproduce it exactly from the sim. */
export interface PopulationPriorMeta {
  n: number;
  seed: number;
  horizonDays: number;
  percentile: number;
  minSample: number;
  generatedAt: string;
  /** One-line honesty note travelling with the data. */
  source: string;
}

/** The full derived artifact: provenance + per-etiology priors (absent etiologies fall back). */
export interface PopulationPrior {
  meta: PopulationPriorMeta;
  byEtiology: Partial<Record<Etiology, EtiologyPrior>>;
}

/**
 * Minimal structural view of a `PatientSimResult` (packages/core/src/sim). Declared locally, and
 * NOT imported from `../sim`, on purpose: it keeps `sr` free of any dependency on `sim` (sim already
 * depends on sr), so there is no import cycle. The regeneration script imports both and passes the
 * real results in — they are structurally assignable to this.
 */
export interface PriorSample {
  etiology: Etiology;
  status: string;
  /** Every non-screening, non-zero within-session trial interval encountered (seconds). */
  trialIntervalsSec: readonly number[];
}

/** Ascending ladder rungs strictly BELOW the ceiling: base, base×g, … while < maxIntervalSec. The
 *  ceiling itself is excluded so a warm-start rung always leaves room to climb (reaching the ceiling
 *  is the between-session handoff, never a valid *opening* rung). */
export function ladderRungsBelowCeiling(config: SrConfig): number[] {
  const rungs = [config.baseIntervalSec];
  let v = config.baseIntervalSec;
  while (v * config.growthFactor < config.maxIntervalSec) {
    v *= config.growthFactor;
    rungs.push(v);
  }
  return rungs;
}

/** Largest ladder rung ≤ `sec`, clamped up to the base (never below the evidence-based floor) and
 *  down to the last rung below the ceiling. Snapping guarantees the prior is always an interval the
 *  deterministic ladder could itself have produced. */
export function snapDownToRung(sec: number, config: SrConfig): number {
  const rungs = ladderRungsBelowCeiling(config);
  let best = rungs[0] as number; // base — the smallest rung, always present
  for (const r of rungs) {
    if (r <= sec) best = r;
    else break;
  }
  return best;
}

/** Nearest-rank percentile over an already-sorted ascending array (mirrors scripts/simulate.ts). */
function nearestRank(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
}

/**
 * Aggregates the simulation cohort into a per-etiology starting-interval prior. Pure: no clock, no
 * randomness, no I/O — deterministic in its inputs (the sim's determinism carries through). For
 * each etiology it pools the within-session trial intervals of that etiology's **mastered** patients
 * (the cohort that demonstrably converged — rescoped/acquiring patients never settled), takes the
 * conservative `WARM_START_PERCENTILE`, and snaps it down to a ladder rung of that etiology's
 * config. Etiologies with fewer than `MIN_PRIOR_SAMPLE` mastered patients (or no trials) get no
 * entry, so the consumer falls back to the cold-start default.
 */
export function derivePopulationPrior(
  samples: readonly PriorSample[],
  meta: Omit<PopulationPriorMeta, "percentile" | "minSample" | "source"> & { source?: string },
): PopulationPrior {
  const byEtiology: Partial<Record<Etiology, EtiologyPrior>> = {};
  const pooledByEtiology = new Map<Etiology, number[]>();
  const countByEtiology = new Map<Etiology, number>();

  for (const s of samples) {
    if (s.status !== "mastered") continue;
    countByEtiology.set(s.etiology, (countByEtiology.get(s.etiology) ?? 0) + 1);
    const pooled = pooledByEtiology.get(s.etiology) ?? [];
    pooled.push(...s.trialIntervalsSec);
    pooledByEtiology.set(s.etiology, pooled);
  }

  for (const [etiology, pooled] of pooledByEtiology) {
    const sampleSize = countByEtiology.get(etiology) ?? 0;
    if (sampleSize < MIN_PRIOR_SAMPLE || pooled.length === 0) continue;
    const sorted = [...pooled].sort((a, b) => a - b);
    const rawPercentileSec = nearestRank(sorted, WARM_START_PERCENTILE);
    if (rawPercentileSec === null) continue;
    const { config } = defaultsForEtiology(etiology);
    const startIntervalSec = snapDownToRung(rawPercentileSec, config);
    byEtiology[etiology] = { startIntervalSec, sampleSize, rawPercentileSec };
  }

  return {
    meta: {
      ...meta,
      percentile: WARM_START_PERCENTILE,
      minSample: MIN_PRIOR_SAMPLE,
      source:
        meta.source ??
        "Derived from the in-silico synthetic-cohort simulation (docs/simulation) — prior, not proof; not patient data.",
    },
    byEtiology,
  };
}

/**
 * Applies an etiology's prior to a config by RAISING `baseIntervalSec` to the warm-start rung. No
 * other field changes; if there is no prior for the etiology, or the warm-start would not raise the
 * base (it never lowers it), the input config is returned unchanged. The warm-start is re-clamped to
 * the config's own below-ceiling rungs so an artifact generated against a different config can never
 * push the base to/over the ceiling.
 */
export function warmStartConfig(config: SrConfig, prior: EtiologyPrior | undefined): SrConfig {
  if (!prior) return config;
  const rungs = ladderRungsBelowCeiling(config);
  const maxOpening = rungs[rungs.length - 1] as number;
  const raised = Math.min(Math.max(prior.startIntervalSec, config.baseIntervalSec), maxOpening);
  if (raised <= config.baseIntervalSec) return config;
  return { ...config, baseIntervalSec: raised };
}

/**
 * Etiology defaults with the population prior optionally applied — the opt-in consumer for
 * target construction. With no prior (or none for this etiology) it is exactly `defaultsForEtiology`
 * (the cold-start fallback), so every existing call site is unaffected until it chooses to pass the
 * prior in. Only `config.baseIntervalSec` can change; `answerFormat`, growth, ceiling, and the whole
 * rescope/mastery machine are untouched.
 */
export function warmStartDefaults(etiology: Etiology, prior?: PopulationPrior): EtiologyDefaults {
  const defaults = defaultsForEtiology(etiology);
  const entry = prior?.byEtiology[etiology];
  if (!entry) return defaults;
  return { ...defaults, config: warmStartConfig(defaults.config, entry) };
}

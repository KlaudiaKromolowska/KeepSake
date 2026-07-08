// In-silico population simulation — Revised_plan.md "Day 3 Track B". Drives ~1,000 synthetic
// patients through the full SR protocol (candidacy -> acquisition -> mastery -> boosters) using
// the real, unmodified `packages/core/src/sr` reducers plus the synthetic memory model in
// `packages/core/src/sim`. Writes an aggregate JSON summary and a handful of self-contained SVG
// charts into docs/simulation/ — no raw per-patient trial dump (that would be a large, mostly
// uninteresting file; the aggregates are what the README/science-page/film slide need).
//
// Usage: `pnpm sim` (n=1000, seed=42, horizon=90d). Override with `pnpm sim -- --n=200 --seed=7`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BoosterCheck, PatientSimResult } from "@keepsake/core/sim";
import { simulatePopulation } from "@keepsake/core/sim";
import { DEFAULT_SR_CONFIG } from "@keepsake/core/sr";
import { barChartSvg } from "./svg-chart";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "docs", "simulation");

interface CliOptions {
  n: number;
  seed: number;
  horizonDays: number;
}

function parseArgs(argv: string[]): CliOptions {
  const get = (name: string, fallback: number): number => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`));
    if (!arg) return fallback;
    const value = Number(arg.split("=")[1]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    n: get("n", 1000),
    seed: get("seed", 42),
    horizonDays: get("horizonDays", 90),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Nearest-rank percentile over an already-sorted ascending array. */
function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? null;
}

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

interface TimeToMasterySummary {
  n: number;
  meanDays: number | null;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  minDays: number | null;
  maxDays: number | null;
}

function summarizeDays(daysValues: number[]): TimeToMasterySummary {
  const sorted = [...daysValues].sort((a, b) => a - b);
  return {
    n: sorted.length,
    meanDays: sorted.length ? round(mean(sorted)) : null,
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    minDays: sorted.length ? round(sorted[0] as number) : null,
    maxDays: sorted.length ? round(sorted[sorted.length - 1] as number) : null,
  };
}

function statusCounts(results: PatientSimResult[]): Record<string, number> {
  const counts: Record<string, number> = {
    not_candidate: 0,
    acquiring: 0,
    mastered: 0,
    rescoped: 0,
  };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

interface EtiologySummary {
  etiology: string;
  n: number;
  candidacyPassRate: number;
  masteredRateOfCandidates: number;
  rescopedRateOfCandidates: number;
  timeToMasteryDays: TimeToMasterySummary;
}

function summarizePerEtiology(results: PatientSimResult[]): EtiologySummary[] {
  const byEtiology = new Map<string, PatientSimResult[]>();
  for (const r of results) {
    const arr = byEtiology.get(r.etiology) ?? [];
    arr.push(r);
    byEtiology.set(r.etiology, arr);
  }
  return [...byEtiology.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([etiology, group]) => {
      const candidates = group.filter((r) => r.candidacyPassed);
      const mastered = candidates.filter((r) => r.status === "mastered");
      const rescoped = candidates.filter((r) => r.status === "rescoped");
      return {
        etiology,
        n: group.length,
        candidacyPassRate: round(candidates.length / group.length),
        masteredRateOfCandidates: round(mastered.length / (candidates.length || 1)),
        rescopedRateOfCandidates: round(rescoped.length / (candidates.length || 1)),
        timeToMasteryDays: summarizeDays(mastered.map((r) => r.daysToMastery as number)),
      };
    });
}

interface BoosterSurvivalBucket {
  cadenceDaysNominal: number;
  n: number;
  recallRate: number;
}

/** Buckets booster-mode (post-mastery) check-ins by nearest nominal cadence step and reports the
 *  recall (retention) rate in each — the "booster survival" curve. Pre-mastery "between" mode
 *  checks are excluded; those are acquisition dynamics, not maintenance. */
function summarizeBoosterSurvival(results: PatientSimResult[]): BoosterSurvivalBucket[] {
  const cadenceSteps = DEFAULT_SR_CONFIG.boosterCadenceDays;
  const buckets = new Map<number, BoosterCheck[]>();
  for (const step of cadenceSteps) buckets.set(step, []);

  for (const r of results) {
    for (const check of r.boosterChecks) {
      if (check.mode !== "booster") continue;
      const nearest = cadenceSteps.reduce((best, step) =>
        Math.abs(check.gapDaysTested - step) < Math.abs(check.gapDaysTested - best) ? step : best,
      );
      buckets.get(nearest)?.push(check);
    }
  }

  return cadenceSteps.map((step) => {
    const checks = buckets.get(step) ?? [];
    const recalls = checks.filter((c) => c.outcome === "recall").length;
    return {
      cadenceDaysNominal: step,
      n: checks.length,
      recallRate: checks.length ? round(recalls / checks.length) : 0,
    };
  });
}

interface IntervalBucket {
  label: string;
  minSec: number;
  maxSec: number;
  count: number;
}

/** Log-scale buckets over within-session trial intervals (seconds). Etiology configs use
 *  different base/growth values, so bucketing by range (rather than exact rung value) keeps the
 *  histogram meaningful across the whole population. */
function summarizeIntervalHistogram(results: PatientSimResult[]): IntervalBucket[] {
  const edges = [0, 10, 20, 40, 80, 160, 320, 640, 1_000];
  const buckets: IntervalBucket[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const minSec = edges[i] as number;
    const maxSec = edges[i + 1] as number;
    buckets.push({ label: `${minSec}-${maxSec}s`, minSec, maxSec, count: 0 });
  }
  for (const r of results) {
    for (const sec of r.trialIntervalsSec) {
      const bucket =
        buckets.find((b) => sec >= b.minSec && sec < b.maxSec) ?? buckets[buckets.length - 1];
      if (bucket) bucket.count += 1;
    }
  }
  return buckets;
}

function writeCharts(
  overallTimeToMastery: TimeToMasterySummary,
  perEtiology: EtiologySummary[],
  boosterSurvival: BoosterSurvivalBucket[],
  intervalHistogram: IntervalBucket[],
): void {
  const timeToMasteryChart = barChartSvg({
    title: "Time to mastery (simulated days)",
    subtitle:
      "Distribution across mastered synthetic patients — percentiles, not individual patients",
    data: [
      { label: "p10", value: overallTimeToMastery.p10 ?? 0 },
      { label: "p25", value: overallTimeToMastery.p25 ?? 0 },
      { label: "p50 (median)", value: overallTimeToMastery.p50 ?? 0 },
      { label: "p75", value: overallTimeToMastery.p75 ?? 0 },
      { label: "p90", value: overallTimeToMastery.p90 ?? 0 },
    ],
    unit: "d",
    color: "#2563eb",
  });
  writeFileSync(join(OUT_DIR, "time-to-mastery.svg"), timeToMasteryChart);

  const etiologyChart = barChartSvg({
    title: "Mastery rate by etiology (of candidacy-screen passers)",
    subtitle: "Fraction of synthetic patients who mastered the target within the 90-day horizon",
    data: perEtiology.map((e) => ({ label: e.etiology, value: e.masteredRateOfCandidates * 100 })),
    unit: "%",
    color: "#0891b2",
  });
  writeFileSync(join(OUT_DIR, "mastery-by-etiology.svg"), etiologyChart);

  const boosterChart = barChartSvg({
    title: "Booster survival — retention at each cadence step",
    subtitle: "Recall rate at post-mastery check-ins, bucketed by nominal booster cadence",
    data: boosterSurvival.map((b) => ({
      label: `${b.cadenceDaysNominal}d (n=${b.n})`,
      value: b.recallRate * 100,
    })),
    unit: "%",
    color: "#059669",
  });
  writeFileSync(join(OUT_DIR, "booster-survival.svg"), boosterChart);

  const intervalChart = barChartSvg({
    title: "Within-session trial interval distribution",
    subtitle: "Every non-screening probe across the population, bucketed by tested interval",
    data: intervalHistogram.map((b) => ({ label: b.label, value: b.count })),
    color: "#7c3aed",
  });
  writeFileSync(join(OUT_DIR, "interval-distribution.svg"), intervalChart);
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  console.error(
    `simulate: running n=${opts.n} seed=${opts.seed} horizonDays=${opts.horizonDays}...`,
  );

  const started = Date.now();
  const results = simulatePopulation(opts);
  const elapsedMs = Date.now() - started;

  const mastered = results.filter((r) => r.status === "mastered");
  const overallTimeToMastery = summarizeDays(mastered.map((r) => r.daysToMastery as number));
  const perEtiology = summarizePerEtiology(results);
  const boosterSurvival = summarizeBoosterSurvival(results);
  const intervalHistogram = summarizeIntervalHistogram(results);
  const candidates = results.filter((r) => r.candidacyPassed);

  const summary = {
    meta: {
      n: opts.n,
      seed: opts.seed,
      horizonDays: opts.horizonDays,
      generatedAt: new Date().toISOString(),
      simulationRuntimeMs: elapsedMs,
    },
    overall: {
      candidacyPassRate: round(candidates.length / results.length),
      statusCounts: statusCounts(results),
      timeToMasteryDays: overallTimeToMastery,
    },
    perEtiology,
    boosterSurvival,
    withinSessionIntervalHistogram: intervalHistogram.map(({ label, count }) => ({ label, count })),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeCharts(overallTimeToMastery, perEtiology, boosterSurvival, intervalHistogram);

  console.error(
    `simulate: done in ${elapsedMs}ms. Wrote summary.json + 4 SVG charts to ${OUT_DIR}`,
  );
  console.error(
    `simulate: candidacy pass rate ${(summary.overall.candidacyPassRate * 100).toFixed(0)}%, ` +
      `mastered ${summary.overall.statusCounts.mastered}/${opts.n}, ` +
      `median time-to-mastery ${overallTimeToMastery.p50 ?? "n/a"}d`,
  );
}

main();

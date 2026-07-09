// Regenerates the committed population-prior artifact (packages/core/src/sr/populationPrior.data.ts)
// from the in-silico simulation. Precomputed + committed on purpose: the prior is a *derived*
// artifact, so it lives as a deterministic, version-controlled constant (no runtime sim cost, and
// any change to the prior shows up as a reviewable diff). Regenerate with `pnpm gen:prior`.
//
// Prior, not proof: every value comes from the illustrative synthetic memory model in
// packages/core/src/sim, never from patient data — see docs/simulation/README.md.
//
// Usage: `pnpm gen:prior` (n=1000, seed=42, horizon=90 — matches the docs/simulation run).
//        Override with `pnpm gen:prior -- --n=1000 --seed=42 --horizonDays=90`.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { simulatePopulation } from "@keepsake/core/sim";
import { derivePopulationPrior, type PopulationPrior } from "@keepsake/core/sr";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "..", "packages", "core", "src", "sr", "populationPrior.data.ts");

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
  return { n: get("n", 1000), seed: get("seed", 42), horizonDays: get("horizonDays", 90) };
}

/** Serializes the artifact as a formatted, self-documenting TS module. */
function render(prior: PopulationPrior): string {
  return `// GENERATED FILE — do not edit by hand. Regenerate with \`pnpm gen:prior\`.
//
// Per-etiology starting-interval prior, derived from the in-silico population simulation
// (packages/core/src/sim, docs/simulation). PRIOR, NOT PROOF: aggregated from an illustrative
// synthetic memory model, never from patient data. See populationPrior.ts for the honest-framing
// docstring, the aggregation method (p25 of mastered patients' within-session intervals, snapped to
// a ladder rung), and how it is consumed (raising baseIntervalSec — the deterministic ladder is
// unchanged).
import type { PopulationPrior } from "./populationPrior";

export const POPULATION_PRIOR: PopulationPrior = ${JSON.stringify(prior, null, 2)};
`;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  console.error(
    `gen:prior: simulating n=${opts.n} seed=${opts.seed} horizonDays=${opts.horizonDays}...`,
  );
  const results = simulatePopulation(opts);
  const prior = derivePopulationPrior(results, {
    n: opts.n,
    seed: opts.seed,
    horizonDays: opts.horizonDays,
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(OUT_FILE, render(prior));
  const entries = Object.entries(prior.byEtiology)
    .map(([et, p]) => `${et}=${p?.startIntervalSec}s(n=${p?.sampleSize})`)
    .join(", ");
  console.error(`gen:prior: wrote ${OUT_FILE}`);
  console.error(`gen:prior: ${entries || "(no etiology met the sample threshold)"}`);
}

main();

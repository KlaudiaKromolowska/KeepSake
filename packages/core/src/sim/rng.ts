/**
 * Deterministic PRNG for the in-silico simulation harness (docs/simulation). Not a security
 * primitive — just a small, dependency-free source of reproducible randomness so a given seed
 * always reproduces the same 1,000 synthetic patients and the same trial-by-trial outcomes.
 *
 * mulberry32 (public-domain algorithm, widely used for exactly this purpose) — no new dependency,
 * per CLAUDE.md's "ten plain lines over a new dependency."
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Bernoulli draw: true with probability `p` (clamped to [0, 1]). */
  bool(p: number): boolean;
  /** Uniform pick from a non-empty readonly array. */
  pick<T>(items: readonly T[]): T;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a seeded RNG. The same seed always yields the same sequence of draws. */
export function createRng(seed: number): Rng {
  const draw = mulberry32(seed);
  return {
    next: draw,
    int(maxExclusive: number): number {
      return Math.floor(draw() * maxExclusive);
    },
    bool(p: number): boolean {
      return draw() < p;
    },
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(draw() * items.length)];
      if (item === undefined) throw new Error("Rng.pick: empty array");
      return item;
    },
  };
}

/**
 * Approximately Normal-ish sample in [0, 1) via the Irwin-Hall/Bates method (mean of `n` uniform
 * draws): cheap, dependency-free, and adequate for a synthetic "ability" parameter — not a claim
 * of any particular clinical ability distribution (see docs/simulation/README.md).
 */
export function batesUnit(rng: Rng, n = 3): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += rng.next();
  return sum / n;
}

import { describe, expect, it } from "vitest";
import type { Etiology } from "../sr/types";
import {
  drawOutcome,
  etiologyDecayMultiplier,
  growAfterSuccess,
  initialStrengthSec,
  recallProbability,
  shrinkAfterFailure,
} from "./memoryModel";
import { createRng } from "./rng";

const ETIOLOGIES: readonly Etiology[] = [
  "alzheimers",
  "vascular",
  "lewy",
  "parkinsons",
  "mixed",
  "unspecified",
];

describe("initialStrengthSec", () => {
  it("is always strictly positive across the full ability range and every etiology", () => {
    for (const etiology of ETIOLOGIES) {
      for (const ability of [0, 0.25, 0.5, 0.75, 0.999]) {
        expect(initialStrengthSec(ability, etiology).strengthSec).toBeGreaterThan(0);
      }
    }
  });

  it("higher ability never yields lower strength, all else equal", () => {
    for (const etiology of ETIOLOGIES) {
      const low = initialStrengthSec(0.1, etiology).strengthSec;
      const high = initialStrengthSec(0.9, etiology).strengthSec;
      expect(high).toBeGreaterThanOrEqual(low);
    }
  });

  it("a faster-decay etiology (lewy) starts no stronger than a baseline one (alzheimers)", () => {
    const ability = 0.5;
    const baseline = initialStrengthSec(ability, "alzheimers").strengthSec;
    const fasterDecay = initialStrengthSec(ability, "lewy").strengthSec;
    expect(fasterDecay).toBeLessThanOrEqual(baseline);
  });
});

describe("etiologyDecayMultiplier", () => {
  it("is >= 1 for every etiology (never slower than baseline)", () => {
    for (const etiology of ETIOLOGIES) {
      expect(etiologyDecayMultiplier(etiology)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("recallProbability", () => {
  it("stays within (0, 1) — never a hard certainty in either direction", () => {
    const memory = { strengthSec: 30 };
    for (const elapsedSec of [0, 1, 30, 100, 100_000]) {
      const p = recallProbability(memory, elapsedSec);
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });

  it("decreases monotonically as elapsed time grows", () => {
    const memory = { strengthSec: 60 };
    let prev = recallProbability(memory, 0);
    for (const elapsedSec of [10, 30, 60, 120, 600]) {
      const p = recallProbability(memory, elapsedSec);
      expect(p).toBeLessThanOrEqual(prev);
      prev = p;
    }
  });

  it("a stronger memory recalls at least as well at the same elapsed time", () => {
    const weak = { strengthSec: 20 };
    const strong = { strengthSec: 200 };
    expect(recallProbability(strong, 50)).toBeGreaterThanOrEqual(recallProbability(weak, 50));
  });
});

describe("growAfterSuccess / shrinkAfterFailure", () => {
  it("growAfterSuccess never decreases strength", () => {
    const memory = { strengthSec: 15 };
    const grown = growAfterSuccess(memory, 15, 0.5);
    expect(grown.strengthSec).toBeGreaterThanOrEqual(memory.strengthSec);
  });

  it("shrinkAfterFailure never increases strength and stays positive", () => {
    const memory = { strengthSec: 100 };
    const shrunk = shrinkAfterFailure(memory, 0.5);
    expect(shrunk.strengthSec).toBeLessThanOrEqual(memory.strengthSec);
    expect(shrunk.strengthSec).toBeGreaterThan(0);
  });

  it("repeated failures approach a floor rather than collapsing to zero", () => {
    let memory = { strengthSec: 500 };
    for (let i = 0; i < 50; i++) memory = shrinkAfterFailure(memory, 0.1);
    expect(memory.strengthSec).toBeGreaterThan(0);
  });
});

describe("drawOutcome", () => {
  it("is deterministic for a given seed", () => {
    const memory = { strengthSec: 30 };
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 50 }, () => drawOutcome(a, memory, 20));
    const seqB = Array.from({ length: 50 }, () => drawOutcome(b, memory, 20));
    expect(seqA).toEqual(seqB);
  });

  it("only ever returns recall, miss, or unclear", () => {
    const rng = createRng(1);
    const memory = { strengthSec: 30 };
    for (let i = 0; i < 200; i++) {
      expect(["recall", "miss", "unclear"]).toContain(drawOutcome(rng, memory, 15));
    }
  });

  it("at elapsed 0 with a strong memory, recall is the overwhelmingly likely outcome", () => {
    const rng = createRng(2);
    const memory = { strengthSec: 1000 };
    const outcomes = Array.from({ length: 500 }, () => drawOutcome(rng, memory, 0));
    const recalls = outcomes.filter((o) => o === "recall").length;
    expect(recalls / outcomes.length).toBeGreaterThan(0.85);
  });
});

import { describe, expect, it } from "vitest";
import { ETIOLOGIES, samplePatient, samplePatients } from "./patient";
import { createRng } from "./rng";

describe("samplePatients", () => {
  it("is deterministic for a given seed", () => {
    const a = samplePatients(createRng(42), 200);
    const b = samplePatients(createRng(42), 200);
    expect(a).toEqual(b);
  });

  it("assigns sequential ids starting at 0", () => {
    const patients = samplePatients(createRng(1), 10);
    expect(patients.map((p) => p.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("only samples etiologies the engine supports", () => {
    const patients = samplePatients(createRng(7), 500);
    for (const p of patients) {
      expect(ETIOLOGIES).toContain(p.etiology);
    }
  });

  it("keeps ability within [0, 1)", () => {
    const patients = samplePatients(createRng(3), 500);
    for (const p of patients) {
      expect(p.ability).toBeGreaterThanOrEqual(0);
      expect(p.ability).toBeLessThan(1);
    }
  });

  it("covers every supported etiology across a large enough sample", () => {
    const patients = samplePatients(createRng(11), 1_000);
    const seen = new Set(patients.map((p) => p.etiology));
    for (const etiology of ETIOLOGIES) {
      expect(seen.has(etiology)).toBe(true);
    }
  });

  it("different seeds produce different populations", () => {
    const a = samplePatients(createRng(1), 50);
    const b = samplePatients(createRng(2), 50);
    expect(a).not.toEqual(b);
  });
});

describe("samplePatient", () => {
  it("consumes a fixed number of RNG draws regardless of id", () => {
    const rng1 = createRng(5);
    const p1 = samplePatient(rng1, 0);
    const nextDraw1 = rng1.next();

    const rng2 = createRng(5);
    samplePatient(rng2, 999); // id shouldn't change how many draws are consumed
    const nextDraw2 = rng2.next();

    expect(nextDraw1).toBe(nextDraw2);
    expect(p1.id).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { batesUnit, createRng } from "./rng";

describe("createRng", () => {
  it("is deterministic: the same seed yields the same sequence", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds yield different sequences", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("next() always stays within [0, 1)", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) always stays within [0, n)", () => {
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
  });

  it("bool(0) is never true and bool(1) is always true", () => {
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      expect(rng.bool(0)).toBe(false);
      expect(rng.bool(1)).toBe(true);
    }
  });

  it("pick() only returns elements from the input array", () => {
    const rng = createRng(11);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i++) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it("pick() throws on an empty array", () => {
    const rng = createRng(1);
    expect(() => rng.pick([])).toThrow();
  });
});

describe("batesUnit", () => {
  it("stays within [0, 1)", () => {
    const rng = createRng(5);
    for (let i = 0; i < 500; i++) {
      const v = batesUnit(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => batesUnit(a));
    const seqB = Array.from({ length: 20 }, () => batesUnit(b));
    expect(seqA).toEqual(seqB);
  });
});

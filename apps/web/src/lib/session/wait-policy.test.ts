import { DEFAULT_SR_CONFIG, type SrConfig, scaleWaitMs } from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import { demoWaitMs, ladderRungs, REALTIME_MAX_SEC } from "./wait-policy";

describe("REALTIME_MAX_SEC", () => {
  it("is 60 seconds", () => {
    expect(REALTIME_MAX_SEC).toBe(60);
  });
});

describe("demoWaitMs", () => {
  it("plays real time at 15s regardless of demo speed", () => {
    expect(demoWaitMs(15, 60)).toBe(15_000);
  });

  it("plays real time at 30s regardless of demo speed", () => {
    expect(demoWaitMs(30, 60)).toBe(30_000);
  });

  it("plays real time at exactly 60s (boundary is inclusive)", () => {
    expect(demoWaitMs(60, 60)).toBe(60_000);
  });

  it("compresses waits above 60s via core's scaleWaitMs", () => {
    expect(demoWaitMs(120, 60)).toBe(scaleWaitMs(120_000, 60));
  });

  it("compresses the ceiling wait (960s) via core's scaleWaitMs", () => {
    expect(demoWaitMs(960, 60)).toBe(scaleWaitMs(960_000, 60));
  });

  it("demoSpeed of 1 leaves an above-threshold wait real", () => {
    expect(demoWaitMs(120, 1)).toBe(120_000);
  });

  it("delegates non-finite/<=1 speed handling to scaleWaitMs (bad env var never breaks a session)", () => {
    expect(demoWaitMs(120, Number.NaN)).toBe(scaleWaitMs(120_000, Number.NaN));
    expect(demoWaitMs(120, 0)).toBe(scaleWaitMs(120_000, 0));
    expect(demoWaitMs(120, -5)).toBe(scaleWaitMs(120_000, -5));
  });
});

describe("ladderRungs", () => {
  it("produces the default doubling ladder from base to the ceiling", () => {
    expect(ladderRungs(DEFAULT_SR_CONFIG)).toEqual([15, 30, 60, 120, 240, 480, 960]);
  });

  it("produces rounded, strictly increasing, deduped rungs for a 1.5x growth config", () => {
    const config: SrConfig = {
      ...DEFAULT_SR_CONFIG,
      baseIntervalSec: 15,
      growthFactor: 1.5,
      maxIntervalSec: 960,
    };
    const rungs = ladderRungs(config);

    expect(rungs[0]).toBe(15);
    expect(rungs.at(-1)).toBe(960);
    expect(rungs.every(Number.isInteger)).toBe(true);
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i]).toBeGreaterThan(rungs[i - 1]);
    }
    expect(new Set(rungs).size).toBe(rungs.length);
  });
});

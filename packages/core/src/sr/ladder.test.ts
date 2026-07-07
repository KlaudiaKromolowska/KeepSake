import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "./config";
import { isAtCeiling, nextIntervalSec, resetIntervalSec } from "./ladder";

describe("nextIntervalSec", () => {
  it("walks the full ladder 15 -> 30 -> ... -> 960", () => {
    const rungs = [15, 30, 60, 120, 240, 480, 960];
    let current = rungs[0] as number;
    for (const expected of rungs.slice(1)) {
      current = nextIntervalSec(current, DEFAULT_SR_CONFIG);
      expect(current).toBe(expected);
    }
  });

  it("caps at maxIntervalSec once the ceiling is reached", () => {
    expect(nextIntervalSec(960, DEFAULT_SR_CONFIG)).toBe(960);
  });

  it("does not mutate the config it was given", () => {
    const configCopy = { ...DEFAULT_SR_CONFIG };
    nextIntervalSec(15, DEFAULT_SR_CONFIG);
    expect(DEFAULT_SR_CONFIG).toEqual(configCopy);
  });
});

describe("resetIntervalSec", () => {
  it("reverts to the base interval when there is no prior success", () => {
    expect(resetIntervalSec(null, DEFAULT_SR_CONFIG)).toBe(15);
  });

  it("reverts to the last successful interval when one exists", () => {
    expect(resetIntervalSec(120, DEFAULT_SR_CONFIG)).toBe(120);
  });

  it("never reverts to zero", () => {
    expect(resetIntervalSec(null, DEFAULT_SR_CONFIG)).toBeGreaterThan(0);
  });
});

describe("isAtCeiling", () => {
  it("is false just below the ceiling", () => {
    expect(isAtCeiling(959.9, DEFAULT_SR_CONFIG)).toBe(false);
  });

  it("is true exactly at the ceiling", () => {
    expect(isAtCeiling(960, DEFAULT_SR_CONFIG)).toBe(true);
  });

  it("is true above the ceiling", () => {
    expect(isAtCeiling(1200, DEFAULT_SR_CONFIG)).toBe(true);
  });
});

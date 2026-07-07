import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "./config";

describe("DEFAULT_SR_CONFIG", () => {
  it("has a base interval strictly below the max interval", () => {
    expect(DEFAULT_SR_CONFIG.baseIntervalSec).toBeLessThan(DEFAULT_SR_CONFIG.maxIntervalSec);
  });

  it("has a growth factor greater than 1 so the ladder actually expands", () => {
    expect(DEFAULT_SR_CONFIG.growthFactor).toBeGreaterThan(1);
  });

  it("has a strictly increasing booster cadence", () => {
    const cadence = DEFAULT_SR_CONFIG.boosterCadenceDays;
    for (let i = 1; i < cadence.length; i++) {
      expect(cadence[i]).toBeGreaterThan(cadence[i - 1] as number);
    }
  });

  it("has ascending candidacy levels starting at 0", () => {
    const levels = DEFAULT_SR_CONFIG.candidacyLevelsSec;
    expect(levels[0]).toBe(0);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1] as number);
    }
  });

  it("keeps the between-session gap floor at or below the gap cap", () => {
    expect(DEFAULT_SR_CONFIG.gapFloorDays).toBeLessThanOrEqual(DEFAULT_SR_CONFIG.gapCapDays);
  });

  it("shrinks gaps on failure and grows them on success", () => {
    expect(DEFAULT_SR_CONFIG.gapShrink).toBeLessThan(1);
    expect(DEFAULT_SR_CONFIG.gapGrowth).toBeGreaterThan(1);
  });
});

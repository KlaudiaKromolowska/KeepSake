import { describe, expect, it } from "vitest";
import { fixedClock } from "./clock";

describe("fixedClock", () => {
  it("always returns the epoch ms it was created with", () => {
    const clock = fixedClock(1_720_000_000_000);
    expect(clock.now()).toBe(1_720_000_000_000);
    expect(clock.now()).toBe(1_720_000_000_000);
  });

  it("does not drift across repeated calls (deterministic, no wall-clock reads)", () => {
    const clock = fixedClock(0);
    const first = clock.now();
    const second = clock.now();
    expect(first).toBe(second);
  });
});

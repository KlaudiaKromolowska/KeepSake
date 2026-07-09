import { describe, expect, it } from "vitest";
import { buildOptions, outcomeForPick, validateLures } from "./recognition-rules";

describe("validateLures", () => {
  it("accepts exactly three distinct, short, non-answer lures", () => {
    expect(validateLures(["Monday", "Tuesday", "Friday"], "Sunday")).toBe(true);
  });

  it("rejects the wrong count", () => {
    expect(validateLures(["Monday", "Tuesday"], "Sunday")).toBe(false);
    expect(validateLures(["Monday", "Tuesday", "Friday", "Saturday"], "Sunday")).toBe(false);
  });

  it("rejects a lure equal to the answer (case-insensitive)", () => {
    expect(validateLures(["Monday", "sunday", "Friday"], "Sunday")).toBe(false);
  });

  it("rejects a lure that contains the answer or is contained by it", () => {
    expect(validateLures(["Sunday morning", "Monday", "Friday"], "Sunday")).toBe(false);
    expect(validateLures(["Sun", "Monday", "Friday"], "Sunday")).toBe(false);
  });

  it("rejects duplicate lures (case-insensitive)", () => {
    expect(validateLures(["Monday", "monday", "Friday"], "Sunday")).toBe(false);
  });

  it("rejects empty, whitespace, or over-long lures and an empty answer", () => {
    expect(validateLures(["", "Tuesday", "Friday"], "Sunday")).toBe(false);
    expect(validateLures(["Monday", "Tuesday", "x".repeat(41)], "Sunday")).toBe(false);
    expect(validateLures(["Monday", "Tuesday", "Friday"], "  ")).toBe(false);
  });
});

describe("buildOptions", () => {
  it("includes the answer and all lures", () => {
    const options = buildOptions("Sunday", ["Monday", "Tuesday", "Friday"]);
    expect(options).toHaveLength(4);
    expect(options).toContain("Sunday");
    expect(options).toEqual(expect.arrayContaining(["Monday", "Tuesday", "Friday"]));
  });

  it("trims each option", () => {
    const options = buildOptions("  Sunday  ", [" Monday ", "Tuesday", "Friday"], () => 0);
    expect(options).toContain("Sunday");
    expect(options).toContain("Monday");
    expect(options).not.toContain(" Monday ");
  });

  it("shuffles deterministically under an injected rng", () => {
    const rng = () => 0; // Fisher-Yates with rng()=0 rotates the answer off the front
    expect(buildOptions("Sunday", ["Monday", "Tuesday", "Friday"], rng)).toEqual([
      "Monday",
      "Tuesday",
      "Friday",
      "Sunday",
    ]);
  });
});

describe("outcomeForPick", () => {
  it("maps a correct pick to the existing recall outcome", () => {
    expect(outcomeForPick("Sunday", "Sunday")).toBe("recall");
    expect(outcomeForPick("  sunday ", "Sunday")).toBe("recall");
  });

  it("maps a wrong pick to the existing miss outcome (drives errorless correction)", () => {
    expect(outcomeForPick("Monday", "Sunday")).toBe("miss");
  });
});

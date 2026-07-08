import { describe, expect, it } from "vitest";
import { DISTRACTOR_PROMPTS, distractorForTrial } from "./distractors";

describe("DISTRACTOR_PROMPTS", () => {
  it("has 8 non-empty prompts, each at most 90 characters", () => {
    expect(DISTRACTOR_PROMPTS).toHaveLength(8);
    for (const prompt of DISTRACTOR_PROMPTS) {
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt.length).toBeLessThanOrEqual(90);
    }
  });
});

describe("distractorForTrial", () => {
  it("is deterministic for a given trial count", () => {
    expect(distractorForTrial(3)).toBe(distractorForTrial(3));
  });

  it("selects prompts in rotation order starting from trial 0", () => {
    for (let i = 0; i < DISTRACTOR_PROMPTS.length; i++) {
      expect(distractorForTrial(i)).toBe(DISTRACTOR_PROMPTS[i]);
    }
  });

  it("wraps around once trialCount exceeds the prompt count", () => {
    expect(distractorForTrial(DISTRACTOR_PROMPTS.length)).toBe(DISTRACTOR_PROMPTS[0]);
    expect(distractorForTrial(DISTRACTOR_PROMPTS.length + 2)).toBe(DISTRACTOR_PROMPTS[2]);
  });

  it("uses the personalized list when provided", () => {
    const personalized = ["Ask about the garden.", "Talk about yesterday's walk."];
    expect(distractorForTrial(0, personalized)).toBe(personalized[0]);
    expect(distractorForTrial(1, personalized)).toBe(personalized[1]);
  });

  it("wraps around within the personalized list independently of the static list length", () => {
    const personalized = ["Ask about the garden.", "Talk about yesterday's walk."];
    expect(distractorForTrial(2, personalized)).toBe(personalized[0]);
  });

  it("falls back to the static list when prompts is undefined or empty", () => {
    expect(distractorForTrial(0, undefined)).toBe(DISTRACTOR_PROMPTS[0]);
    expect(distractorForTrial(0, [])).toBe(DISTRACTOR_PROMPTS[0]);
  });
});

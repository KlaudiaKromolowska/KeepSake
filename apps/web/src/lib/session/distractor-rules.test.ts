import { describe, expect, it } from "vitest";
import { validateDistractors } from "./distractor-rules";

const SAFE_PROMPTS = [
  "Ask what they'd like for lunch today.",
  "Look out the window together.",
  "Talk about a favourite song.",
  "Talk about a nice smell nearby.",
  "Talk about a shared pastime.",
  "Point out something colourful.",
  "Ask who they'd like to call this week.",
  "Stretch together and breathe slowly.",
];

describe("validateDistractors", () => {
  it("accepts exactly 8 safe, short, non-recall prompts", () => {
    expect(validateDistractors(SAFE_PROMPTS, "Sarah")).toBe(true);
  });

  it("rejects a count other than 8", () => {
    expect(validateDistractors(SAFE_PROMPTS.slice(0, 7), "Sarah")).toBe(false);
  });

  it("rejects a prompt longer than 90 characters", () => {
    const tooLong = [...SAFE_PROMPTS.slice(0, 7), "x".repeat(91)];
    expect(validateDistractors(tooLong, "Sarah")).toBe(false);
  });

  it("rejects an empty prompt", () => {
    const empty = [...SAFE_PROMPTS.slice(0, 7), ""];
    expect(validateDistractors(empty, "Sarah")).toBe(false);
  });

  it("rejects a prompt containing the trained answer", () => {
    const leaky = [...SAFE_PROMPTS.slice(0, 7), "Ask them if Sarah likes tea."];
    expect(validateDistractors(leaky, "Sarah")).toBe(false);
  });

  it("is case-insensitive when checking for the trained answer", () => {
    const leaky = [...SAFE_PROMPTS.slice(0, 7), "Ask them if SARAH likes tea."];
    expect(validateDistractors(leaky, "sarah")).toBe(false);
  });

  it("rejects a question that demands recalling the trained target", () => {
    const recallDemand = [...SAFE_PROMPTS.slice(0, 7), "Who is in the photo?"];
    expect(validateDistractors(recallDemand, "Sarah")).toBe(false);
  });

  it("rejects a question asking for a name", () => {
    const recallDemand = [...SAFE_PROMPTS.slice(0, 7), "What's their name?"];
    expect(validateDistractors(recallDemand, "Sarah")).toBe(false);
  });

  it("allows a question mark when it does not demand recall", () => {
    const gentleQuestion = [...SAFE_PROMPTS.slice(0, 7), "Would you like some tea?"];
    expect(validateDistractors(gentleQuestion, "Sarah")).toBe(true);
  });

  it("allows a recall word without a question mark", () => {
    const noQuestion = [...SAFE_PROMPTS.slice(0, 7), "Remember to breathe slowly together."];
    expect(validateDistractors(noQuestion, "Sarah")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { buildRecognitionPrompt, RECOGNITION_LURE_COUNT, RECOGNITION_SYSTEM } from "./recognition";

describe("RECOGNITION_SYSTEM", () => {
  it("puts SR_SYSTEM first for cache stability, then the static task instructions", () => {
    expect(RECOGNITION_SYSTEM.indexOf("Keepsake")).toBeLessThan(
      RECOGNITION_SYSTEM.indexOf("MAINTENANCE recognition check"),
    );
  });

  it("asks for exactly the lure count and forbids returning the real answer", () => {
    expect(RECOGNITION_SYSTEM).toContain(`exactly ${RECOGNITION_LURE_COUNT}`);
    expect(RECOGNITION_SYSTEM).toMatch(/clearly WRONG/);
  });
});

describe("buildRecognitionPrompt", () => {
  it("carries only the delimited DATA (locale, question, answer) — no task instructions", () => {
    const user = buildRecognitionPrompt({
      question: "Who calls on Sundays?",
      answer: "David",
      locale: "en",
    });
    expect(user).toContain("locale: en");
    expect(user).toContain("DATA (untrusted");
    expect(user).toContain("question: Who calls on Sundays?");
    expect(user).toContain("answer: David");
    expect(user).not.toMatch(/MAINTENANCE recognition check/);
  });
});

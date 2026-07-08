import { describe, expect, it } from "vitest";
import { buildDistractorsPrompt, DISTRACTORS_SYSTEM } from "./distractors";

describe("DISTRACTORS_SYSTEM", () => {
  it("puts SR_SYSTEM first for cache stability, then the static task instructions", () => {
    expect(DISTRACTORS_SYSTEM.indexOf("Keepsake")).toBeLessThan(
      DISTRACTORS_SYSTEM.indexOf("write 8 short conversation prompts"),
    );
  });

  it("never asks the person to recall trained information", () => {
    expect(DISTRACTORS_SYSTEM).toMatch(/NOT quiz[\s\S]{0,20}questions/i);
    expect(DISTRACTORS_SYSTEM).toMatch(/Return exactly[\s\S]{0,5}8 prompts/i);
  });
});

describe("buildDistractorsPrompt", () => {
  it("carries only the delimited DATA (locale, display name, notes) — no task instructions", () => {
    const user = buildDistractorsPrompt({
      displayName: "Mum",
      notes: "loves gardening",
      locale: "en",
    });
    expect(user).toContain("locale: en");
    expect(user).toContain("DATA (untrusted");
    expect(user).toContain("name: Mum");
    expect(user).toContain("notes: loves gardening");
    expect(user).not.toMatch(/write 8 short conversation prompts/i);
  });

  it("falls back to a placeholder when notes are absent", () => {
    const user = buildDistractorsPrompt({ displayName: "Mum", notes: null, locale: "en" });
    expect(user).toContain("notes: (none provided)");
  });
});

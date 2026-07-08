import { describe, expect, it } from "vitest";
import { validateTarget } from "./rules";

/** A well-formed proposal that passes every rule; tests override one field at a time. */
const good = {
  question: "What is your daughter's name?",
  answer: "Sarah",
};

describe("validateTarget — passing", () => {
  it("accepts a well-formed single-fact target", () => {
    expect(validateTarget(good)).toEqual({ ok: true });
  });

  it("accepts a six-word answer at the boundary", () => {
    expect(
      validateTarget({ question: "Where did you grow up?", answer: "A small town near the coast" }),
    ).toEqual({ ok: true });
  });

  it("accepts a 120-char question at the boundary", () => {
    const q = `${"a".repeat(119)}?`; // 120 chars, ends with ?
    expect(q.length).toBe(120);
    expect(validateTarget({ question: q, answer: "Yes indeed" }).ok).toBe(true);
  });
});

describe("validateTarget — question shape", () => {
  it("rejects a question that does not end with a question mark", () => {
    const r = validateTarget({ question: "Your daughter's name.", answer: "Sarah" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/question mark/i);
  });

  it("rejects a question longer than 120 characters", () => {
    const q = `${"How are you feeling about the weather today my dear friend ".repeat(3)}?`;
    expect(q.length).toBeGreaterThan(120);
    const r = validateTarget({ question: q, answer: "Fine" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/120/);
  });

  it("rejects yes/no question forms", () => {
    for (const q of [
      "Is your daughter called Sarah?",
      "Are we going home soon?",
      "Do you like tea?",
      "Does she visit often?",
      "Did you eat lunch?",
      "Can you remember her?",
      "Was it sunny today?",
      "Were you at home?",
    ]) {
      const r = validateTarget({ question: q, answer: "Sarah" });
      expect(r.ok, q).toBe(false);
      if (!r.ok) expect(r.violations.join(" ")).toMatch(/yes.?no/i);
    }
  });

  it("does not flag a wh-question that merely contains a yes/no word later", () => {
    // "did" appears mid-sentence, not as the opening word.
    expect(validateTarget({ question: "Where did you meet Grandpa?", answer: "In Paris" }).ok).toBe(
      true,
    );
  });
});

describe("validateTarget — answer shape", () => {
  it("rejects an empty answer", () => {
    const r = validateTarget({ question: "What is her name?", answer: "  " });
    expect(r.ok).toBe(false);
  });

  it("rejects an answer over six words", () => {
    const r = validateTarget({
      question: "Where did you grow up?",
      answer: "In a small town by the sea",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/word/i);
  });

  it("rejects an answer longer than 40 characters even within the word limit", () => {
    const r = validateTarget({
      question: "What is the address?",
      answer: "Northumberlandshireton Grandchester Manor",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/40|short/i);
  });
});

describe("validateTarget — answer leakage", () => {
  it("rejects an answer contained verbatim in the question", () => {
    const r = validateTarget({ question: "Is Sarah your daughter?", answer: "Sarah" });
    expect(r.ok).toBe(false);
  });

  it("detects leakage case-insensitively", () => {
    const r = validateTarget({ question: "Where is PARIS on the map?", answer: "Paris" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.join(" ")).toMatch(/question already/i);
  });
});

describe("validateTarget — multiple violations", () => {
  it("reports every broken rule at once", () => {
    const r = validateTarget({
      question: "Is Sarah here.",
      answer: "Yes Sarah is definitely right here now",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.length).toBeGreaterThan(1);
  });
});

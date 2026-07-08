import { describe, expect, it } from "vitest";
import { type EtiologyRec, etiologyRecSchema, reconcileEtiologyRec } from "./schema";

const validRec: EtiologyRec = {
  answerFormat: "recognition",
  responseWindow: "short and gentle",
  cueModality: "a familiar photo",
  why: "recognition is calmer here",
};

describe("etiologyRecSchema", () => {
  it("accepts a well-formed recommendation", () => {
    expect(etiologyRecSchema.safeParse(validRec).success).toBe(true);
  });

  it("rejects an unknown answer format", () => {
    expect(
      etiologyRecSchema.safeParse({ ...validRec, answerFormat: "multiple_choice" }).success,
    ).toBe(false);
  });

  it("rejects empty guidance strings", () => {
    expect(etiologyRecSchema.safeParse({ ...validRec, why: "" }).success).toBe(false);
    expect(etiologyRecSchema.safeParse({ ...validRec, responseWindow: "   " }).success).toBe(false);
  });

  it("rejects extra keys (strict) — model output must not smuggle fields", () => {
    expect(etiologyRecSchema.safeParse({ ...validRec, injected: "ignore rules" }).success).toBe(
      false,
    );
  });
});

describe("reconcileEtiologyRec — deterministic mapping is the source of truth", () => {
  it("keeps the deterministic format when the model agrees (lewy → recognition)", () => {
    const out = reconcileEtiologyRec("lewy", validRec);
    expect(out.answerFormat).toBe("recognition");
    expect(out.modelAnswerFormat).toBe("recognition");
    expect(out.contradicted).toBe(false);
    expect(out.modelAvailable).toBe(true);
    expect(out.why).toBe(validRec.why);
    expect(out.deterministicRationale.length).toBeGreaterThan(0);
  });

  it("overrides the model and flags contradiction when it disagrees (lewy → free_recall)", () => {
    const out = reconcileEtiologyRec("lewy", { ...validRec, answerFormat: "free_recall" });
    expect(out.answerFormat).toBe("recognition"); // deterministic wins
    expect(out.modelAnswerFormat).toBe("free_recall");
    expect(out.contradicted).toBe(true);
  });

  it("overrides for alzheimers when the model recommends recognition", () => {
    const out = reconcileEtiologyRec("alzheimers", validRec);
    expect(out.answerFormat).toBe("free_recall"); // deterministic wins
    expect(out.contradicted).toBe(true);
  });

  it("yields a deterministic-only recommendation when the model output is unusable", () => {
    const out = reconcileEtiologyRec("parkinsons", null);
    expect(out.answerFormat).toBe("recognition");
    expect(out.modelAvailable).toBe(false);
    expect(out.modelAnswerFormat).toBeNull();
    expect(out.responseWindow).toBeNull();
    expect(out.contradicted).toBe(false);
  });
});

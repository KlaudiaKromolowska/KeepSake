import { loadFixture } from "@keepsake/core/prompts/fixtures";
import { describe, expect, it } from "vitest";
import { coachReplySchema, coachRequestSchema } from "./schema";

describe("coachRequestSchema", () => {
  it("accepts a well-formed conversation ending on the caregiver's turn", () => {
    const ok = coachRequestSchema.safeParse({
      messages: [
        { role: "user", content: "how's it going?" },
        { role: "assistant", content: "warmly said" },
        { role: "user", content: "thanks, one more thing" },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects empty, extra keys, bad roles, over-long content, and last-not-user", () => {
    expect(coachRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(
      coachRequestSchema.safeParse({ messages: [{ role: "user", content: "hi" }], x: 1 }).success,
    ).toBe(false);
    expect(
      coachRequestSchema.safeParse({ messages: [{ role: "system", content: "hi" }] }).success,
    ).toBe(false);
    expect(
      coachRequestSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(1001) }] })
        .success,
    ).toBe(false);
    expect(
      coachRequestSchema.safeParse({
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
        ],
      }).success,
    ).toBe(false);
  });

  it("trims content and rejects whitespace-only messages", () => {
    expect(
      coachRequestSchema.safeParse({ messages: [{ role: "user", content: "   " }] }).success,
    ).toBe(false);
  });
});

describe("coachReplySchema", () => {
  it("accepts { reply, escalate } and rejects malformed / padded output", () => {
    expect(coachReplySchema.safeParse({ reply: "ok", escalate: false }).success).toBe(true);
    expect(coachReplySchema.safeParse({ reply: "ok" }).success).toBe(false);
    expect(coachReplySchema.safeParse({ reply: "ok", escalate: "yes" }).success).toBe(false);
    expect(coachReplySchema.safeParse({ reply: "ok", escalate: false, extra: 1 }).success).toBe(
      false,
    );
  });

  it("the shipped demo fixture is schema-valid (the CLAUDE_FIXTURES replay path)", () => {
    const parsed = coachReplySchema.safeParse(loadFixture("coach"));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Wellness-safe: the canned demo response makes no clinical/"cured" claim.
      expect(parsed.data.reply.toLowerCase()).not.toContain("cured");
    }
  });
});

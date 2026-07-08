import { describe, expect, it } from "vitest";
import { debriefInputSchema } from "./schema";

describe("debriefInputSchema", () => {
  it("accepts a bare uuid sessionId", () => {
    const result = debriefInputSchema.safeParse({
      sessionId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid sessionId", () => {
    expect(debriefInputSchema.safeParse({ sessionId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing sessionId", () => {
    expect(debriefInputSchema.safeParse({}).success).toBe(false);
  });

  it("rejects unknown extra keys (strict)", () => {
    const result = debriefInputSchema.safeParse({
      sessionId: "11111111-1111-4111-8111-111111111111",
      extra: "nope",
    });
    expect(result.success).toBe(false);
  });
});

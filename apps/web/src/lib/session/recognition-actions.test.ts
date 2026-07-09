import { beforeEach, describe, expect, it, vi } from "vitest";
import { recognitionOptionsAction } from "./recognition-actions";

const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/actions", () => ({ requireUser: requireUserMock }));

const { assertAiQuotaMock, generateStructuredMock } = vi.hoisted(() => ({
  assertAiQuotaMock: vi.fn(),
  generateStructuredMock: vi.fn(),
}));
vi.mock("@/lib/ai/core", () => ({
  assertAiQuota: assertAiQuotaMock,
  generateStructured: generateStructuredMock,
}));

const LURES = ["Monday", "Tuesday", "Friday"];

interface FakeOpts {
  target?: { question: string; answer: string } | null;
  targetErr?: unknown;
  scheduleMode?: string | null;
  stateErr?: unknown;
}

function fakeSupabase(opts: FakeOpts) {
  const targetChain = {
    select: () => targetChain,
    eq: () => targetChain,
    maybeSingle: async () => ({ data: opts.target ?? null, error: opts.targetErr ?? null }),
  };
  const stateChain = {
    select: () => stateChain,
    eq: () => stateChain,
    maybeSingle: async () => ({
      data: opts.scheduleMode === undefined ? null : { schedule_mode: opts.scheduleMode },
      error: opts.stateErr ?? null,
    }),
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal test double, not a real SupabaseClient.
  const from = vi.fn((table: string): any => (table === "targets" ? targetChain : stateChain));
  return { from };
}

function mockUser(opts: FakeOpts) {
  requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: fakeSupabase(opts) });
}

describe("recognitionOptionsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the answer among validated lures for a booster-mode target", async () => {
    mockUser({ target: { question: "Who calls?", answer: "David" }, scheduleMode: "booster" });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockResolvedValue({ lures: LURES });

    const { data, error } = await recognitionOptionsAction("t1");

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data).toHaveLength(4);
    expect(data).toContain("David");
    expect(data).toEqual(expect.arrayContaining(LURES));
    expect(generateStructuredMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "recognition", model: "claude-haiku-4-5" }),
    );
  });

  it("also serves a between-mode (ceiling, not yet mastered) target", async () => {
    mockUser({ target: { question: "Who calls?", answer: "David" }, scheduleMode: "between" });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockResolvedValue({ lures: LURES });

    const { data } = await recognitionOptionsAction("t1");
    expect(data).toContain("David");
  });

  it("returns null for an acquisition target (no schedule) WITHOUT any AI spend", async () => {
    mockUser({ target: { question: "Who calls?", answer: "David" }, scheduleMode: null });

    await expect(recognitionOptionsAction("t1")).resolves.toEqual({ data: null, error: null });
    expect(assertAiQuotaMock).not.toHaveBeenCalled();
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("returns null when the target is missing", async () => {
    mockUser({ target: null, scheduleMode: "booster" });

    await expect(recognitionOptionsAction("t1")).resolves.toEqual({ data: null, error: null });
    expect(assertAiQuotaMock).not.toHaveBeenCalled();
  });

  it("falls back to null when the code-side re-check rejects the lures", async () => {
    mockUser({ target: { question: "Who calls?", answer: "David" }, scheduleMode: "booster" });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockResolvedValue({ lures: ["David", "Tuesday", "Friday"] }); // contains answer

    await expect(recognitionOptionsAction("t1")).resolves.toEqual({ data: null, error: null });
  });

  it("falls back to null when quota is exceeded", async () => {
    mockUser({ target: { question: "Who calls?", answer: "David" }, scheduleMode: "booster" });
    assertAiQuotaMock.mockRejectedValue(new Error("quota exceeded"));

    await expect(recognitionOptionsAction("t1")).resolves.toEqual({ data: null, error: null });
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("falls back to null when the AI call fails", async () => {
    mockUser({ target: { question: "Who calls?", answer: "David" }, scheduleMode: "booster" });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockRejectedValue(new Error("AI unavailable"));

    await expect(recognitionOptionsAction("t1")).resolves.toEqual({ data: null, error: null });
  });
});

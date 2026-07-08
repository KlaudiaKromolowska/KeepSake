import { beforeEach, describe, expect, it, vi } from "vitest";
import { personalizedDistractorsAction } from "./distractor-actions";

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

interface FakeOpts {
  target?: { answer: string; patient_id: string } | null;
  targetErr?: unknown;
  patient?: { display_name: string; notes: string | null } | null;
  patientErr?: unknown;
}

function fakeSupabase(opts: FakeOpts) {
  const targetChain = {
    select: () => targetChain,
    in: () => targetChain,
    order: () => targetChain,
    limit: () => targetChain,
    maybeSingle: async () => ({ data: opts.target ?? null, error: opts.targetErr ?? null }),
  };
  const patientChain = {
    select: () => patientChain,
    eq: () => patientChain,
    single: async () => ({ data: opts.patient ?? null, error: opts.patientErr ?? null }),
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal test double, not a real SupabaseClient.
  const from = vi.fn((table: string): any => (table === "targets" ? targetChain : patientChain));
  return { from };
}

function mockRequireUser(opts: FakeOpts) {
  requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: fakeSupabase(opts) });
}

describe("personalizedDistractorsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the personalized prompts on the happy path", async () => {
    mockRequireUser({
      target: { answer: "Sarah", patient_id: "p1" },
      patient: { display_name: "Mum", notes: "loves gardening" },
    });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockResolvedValue({ prompts: SAFE_PROMPTS });

    const result = await personalizedDistractorsAction();

    expect(result).toEqual({ data: SAFE_PROMPTS, error: null });
    expect(generateStructuredMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "distractors", model: "claude-haiku-4-5" }),
    );
    const call = generateStructuredMock.mock.calls[0][0];
    expect(call.effort).toBeUndefined();
  });

  it("silently falls back to null when the code-side re-check rejects the batch", async () => {
    mockRequireUser({
      target: { answer: "Sarah", patient_id: "p1" },
      patient: { display_name: "Mum", notes: null },
    });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockResolvedValue({
      prompts: [...SAFE_PROMPTS.slice(0, 7), "Who is in the photo?"],
    });

    await expect(personalizedDistractorsAction()).resolves.toEqual({ data: null, error: null });
  });

  it("silently falls back to null when quota is exceeded", async () => {
    mockRequireUser({
      target: { answer: "Sarah", patient_id: "p1" },
      patient: { display_name: "Mum", notes: null },
    });
    assertAiQuotaMock.mockRejectedValue(new Error("quota exceeded"));

    await expect(personalizedDistractorsAction()).resolves.toEqual({ data: null, error: null });
    expect(generateStructuredMock).not.toHaveBeenCalled();
  });

  it("silently falls back to null when the AI call fails", async () => {
    mockRequireUser({
      target: { answer: "Sarah", patient_id: "p1" },
      patient: { display_name: "Mum", notes: null },
    });
    assertAiQuotaMock.mockResolvedValue(undefined);
    generateStructuredMock.mockRejectedValue(new Error("AI unavailable"));

    await expect(personalizedDistractorsAction()).resolves.toEqual({ data: null, error: null });
  });

  it("silently falls back to null when there is no active target", async () => {
    mockRequireUser({ target: null, patient: null });

    await expect(personalizedDistractorsAction()).resolves.toEqual({ data: null, error: null });
    expect(assertAiQuotaMock).not.toHaveBeenCalled();
  });

  it("silently falls back to null when the patient row is missing", async () => {
    mockRequireUser({ target: { answer: "Sarah", patient_id: "p1" }, patient: null });

    await expect(personalizedDistractorsAction()).resolves.toEqual({ data: null, error: null });
    expect(assertAiQuotaMock).not.toHaveBeenCalled();
  });
});

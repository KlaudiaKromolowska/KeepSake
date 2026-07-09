import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WizardProposal } from "./schema";

// --- Mock the AI core: no network, no key. generateStructured/assertAiQuota are controlled per test.
const { generateStructuredMock, assertAiQuotaMock, QuotaError, AiUnavailableError } = vi.hoisted(
  () => {
    class QuotaError extends Error {}
    class AiUnavailableError extends Error {}
    return {
      generateStructuredMock: vi.fn(),
      assertAiQuotaMock: vi.fn(),
      QuotaError,
      AiUnavailableError,
    };
  },
);
vi.mock("@/lib/ai/core", () => ({
  generateStructured: generateStructuredMock,
  assertAiQuota: assertAiQuotaMock,
  QuotaError,
  AiUnavailableError,
}));

// --- Mock requireUser so the action gets a fake RLS client with a resolvable patient.
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/actions", async (orig) => {
  const actual = await orig<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: requireUserMock };
});

// --- Mock next/headers cookies: resolveActivePatient reads the active-patient cookie from here.
const { cookiesMock, setActiveCookie } = vi.hoisted(() => {
  let active: string | undefined;
  return {
    cookiesMock: vi.fn(async () => ({
      get: (_name: string) => (active ? { value: active } : undefined),
    })),
    setActiveCookie: (v: string | undefined) => {
      active = v;
    },
  };
});
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { generateStructured } from "@/lib/ai/core";
import { createTargetAction, generateTargetAction } from "./actions";

const proposal: WizardProposal = {
  question: "What is your daughter's name?",
  answer: "Sarah",
  acceptedVariants: ["Sara"],
  answerFormat: "free_recall",
  redFlags: [],
  rationale: "A warm, stable fact worth holding onto.",
  selfCritique: {
    rejectedDraft: { question: "Is your daughter Sarah?", answer: "Yes" },
    reason: "The first version was a yes/no question.",
  },
};

/** A bad proposal that fails code-side rules (yes/no + answer in question). */
const badProposal: WizardProposal = {
  ...proposal,
  question: "Is Sarah your daughter?",
  answer: "Sarah",
};

/**
 * Fake RLS client. `patients` mirrors listOwnedPatients' query shape (`select().eq().order()`
 * resolving to an ARRAY, oldest first) so resolveActivePatient runs for real against it; `targets`
 * captures the insert payload. Defaults to a single patient `p1` (the pre-multi-patient world).
 */
function fakeSupabase(patients: { id: string }[] = [{ id: "p1" }]) {
  const rows = patients.map((p) => ({
    display_name: "Pat",
    timezone: "UTC",
    etiology: "alzheimers",
    ...p,
  }));
  const insert = vi.fn((_payload: Record<string, unknown>) => ({
    select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "t1" }, error: null })) })),
  }));
  const from = vi.fn((table: string) => {
    if (table === "patients") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ order: vi.fn(async () => ({ data: rows, error: null })) })),
        })),
      };
    }
    return { insert };
  });
  return { from, insert } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  setActiveCookie(undefined);
  requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: fakeSupabase() });
  assertAiQuotaMock.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("generateTargetAction", () => {
  it("rejects invalid input without calling the model", async () => {
    const res = await generateTargetAction({ description: "too short" });
    expect(res.error).not.toBeNull();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("returns a valid proposal on the first pass", async () => {
    generateStructuredMock.mockResolvedValueOnce(proposal);
    const res = await generateTargetAction({ description: "My daughter Sarah visits on Sundays." });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(proposal);
    expect(generateStructured).toHaveBeenCalledTimes(1);
  });

  it("strips variants that duplicate the answer or each other (untrusted model output)", async () => {
    generateStructuredMock.mockResolvedValueOnce({
      ...proposal,
      acceptedVariants: ["Sarah", "Sara", "sara", " SARA "],
    });
    const res = await generateTargetAction({ description: "My daughter Sarah visits on Sundays." });
    expect(res.error).toBeNull();
    expect(res.data?.acceptedVariants).toEqual(["Sara"]);
  });

  it("does a single corrective re-ask when the first proposal breaks the rules", async () => {
    generateStructuredMock.mockResolvedValueOnce(badProposal).mockResolvedValueOnce(proposal);
    const res = await generateTargetAction({ description: "My daughter Sarah visits on Sundays." });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(proposal);
    expect(generateStructured).toHaveBeenCalledTimes(2);
    // The re-ask user message must carry the violations for the model to fix.
    const secondUser = generateStructuredMock.mock.calls[1][0].user as string;
    expect(secondUser).toMatch(/practice rules/i);
  });

  it("returns a refine error when the proposal is still bad after the re-ask", async () => {
    generateStructuredMock.mockResolvedValue(badProposal);
    const res = await generateTargetAction({ description: "My daughter Sarah visits on Sundays." });
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/by hand/i);
    expect(generateStructured).toHaveBeenCalledTimes(2);
  });

  it("surfaces a calm quota message and never calls the model", async () => {
    assertAiQuotaMock.mockRejectedValueOnce(new QuotaError("limit"));
    const res = await generateTargetAction({ description: "My daughter Sarah visits on Sundays." });
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/paused/i);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("surfaces a calm error (no raw text) when the model is unavailable", async () => {
    generateStructuredMock.mockRejectedValueOnce(new AiUnavailableError("secret internal detail"));
    const res = await generateTargetAction({ description: "My daughter Sarah visits on Sundays." });
    expect(res.data).toBeNull();
    expect(res.error).not.toMatch(/secret internal/);
    expect(res.error).toMatch(/try again|by hand/i);
  });
});

describe("createTargetAction", () => {
  it("rejects invalid input", async () => {
    const res = await createTargetAction({ question: "", answer: "" });
    expect(res.error).not.toBeNull();
  });

  it("persists an accepted proposal and returns the new id", async () => {
    const res = await createTargetAction({
      question: "What is your daughter's name?",
      answer: "Sarah",
      acceptedVariants: ["Sara"],
      answerFormat: "free_recall",
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual({ id: "t1" });
  });

  const baseInput = {
    question: "What is your daughter's name?",
    answer: "Sarah",
    acceptedVariants: ["Sara"],
    answerFormat: "free_recall" as const,
  };
  const OWN_PHOTO = "u1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png"; // requireUserMock uid is "u1"

  it("attaches an uploaded photo the caregiver owns (folder === their uid) to the target", async () => {
    const sb = fakeSupabase();
    requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: sb });

    const res = await createTargetAction({ ...baseInput, photoPath: OWN_PHOTO });

    expect(res.error).toBeNull();
    expect(sb.insert).toHaveBeenCalledTimes(1);
    expect(sb.insert.mock.calls[0][0]).toMatchObject({ photo_path: OWN_PHOTO });
  });

  it("drops a photo_path under ANOTHER caregiver's folder — never attaches a foreign object", async () => {
    const sb = fakeSupabase();
    requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: sb });

    const res = await createTargetAction({
      ...baseInput,
      photoPath: "someone-else/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png",
    });

    expect(res.error).toBeNull(); // creation is never blocked by a bad photo path
    expect(sb.insert.mock.calls[0][0]).toMatchObject({ photo_path: null });
  });

  it("stores null photo_path when no photo was uploaded", async () => {
    const sb = fakeSupabase();
    requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: sb });

    await createTargetAction(baseInput);

    expect(sb.insert.mock.calls[0][0]).toMatchObject({ photo_path: null });
  });

  it("attaches the target to the ACTIVE (cookie-selected) patient, not the oldest", async () => {
    // Two owned patients, oldest first; the caregiver switched to the NEWER one via the cookie.
    const sb = fakeSupabase([{ id: "p_old" }, { id: "p_new" }]);
    setActiveCookie("p_new");
    requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: sb });

    const res = await createTargetAction(baseInput);

    expect(res.error).toBeNull();
    expect(sb.insert.mock.calls[0][0]).toMatchObject({ patient_id: "p_new" });
  });

  it("falls back to the oldest owned patient when no active-patient cookie is set", async () => {
    const sb = fakeSupabase([{ id: "p_old" }, { id: "p_new" }]);
    requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: sb });

    await createTargetAction(baseInput);

    expect(sb.insert.mock.calls[0][0]).toMatchObject({ patient_id: "p_old" });
  });

  it("returns the no-patient error when the caregiver owns no patients", async () => {
    const sb = fakeSupabase([]);
    requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: sb });

    const res = await createTargetAction(baseInput);

    expect(res.data).toBeNull();
    expect(res.error).not.toBeNull();
    expect(sb.insert).not.toHaveBeenCalled();
  });
});

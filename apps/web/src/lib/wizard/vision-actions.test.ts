import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhotoQaResult } from "./vision-schema";

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

// --- Mock requireUser so the action gets a fake RLS client (its shape doesn't matter here).
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/actions", async (orig) => {
  const actual = await orig<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: requireUserMock };
});

// --- Mock fs so no real file ever needs to exist on disk for the action's happy paths.
const { readFileMock } = vi.hoisted(() => ({ readFileMock: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: readFileMock }));

import { generateStructured } from "@/lib/ai/core";
import { qaPhotoAction } from "./vision-actions";

const goodResult: PhotoQaResult = { verdict: "good", reasons: [], cropAdvice: null };
const needsWorkResult: PhotoQaResult = {
  verdict: "needs_work",
  reasons: ["several people in frame"],
  cropAdvice: "Crop tightly around the subject's face so it fills most of the frame.",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: {} });
  assertAiQuotaMock.mockResolvedValue(undefined);
  readFileMock.mockResolvedValue(Buffer.from("fake-image-bytes"));
});
afterEach(() => vi.clearAllMocks());

describe("qaPhotoAction", () => {
  it("rejects invalid input without calling the model", async () => {
    const res = await qaPhotoAction({ imagePath: "/images/../secrets.jpg" });
    expect(res.error).not.toBeNull();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("returns a good verdict for a valid photo", async () => {
    generateStructuredMock.mockResolvedValueOnce(goodResult);
    const res = await qaPhotoAction({ imagePath: "/images/lena.jpg" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(goodResult);
    const call = generateStructuredMock.mock.calls[0][0];
    expect(call.kind).toBe("vision");
    expect(Array.isArray(call.user)).toBe(true);
    expect(call.user[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg" },
    });
    expect(call.user[1]).toMatchObject({ type: "text" });
  });

  it("includes the memory target in the text block when provided", async () => {
    generateStructuredMock.mockResolvedValueOnce(goodResult);
    const res = await qaPhotoAction({
      imagePath: "/images/lena.jpg",
      target: { question: "What is your granddaughter's name?", answer: "Lena" },
    });
    expect(res.error).toBeNull();
    const text = generateStructuredMock.mock.calls[0][0].user[1].text as string;
    expect(text).toContain("What is your granddaughter's name?");
    expect(text).toContain("Lena");
  });

  it("omits target lines when no target is provided", async () => {
    generateStructuredMock.mockResolvedValueOnce(goodResult);
    await qaPhotoAction({ imagePath: "/images/lena.jpg" });
    const text = generateStructuredMock.mock.calls[0][0].user[1].text as string;
    expect(text).not.toMatch(/memory target/);
  });

  it("returns a needs_work verdict with crop advice", async () => {
    generateStructuredMock.mockResolvedValueOnce(needsWorkResult);
    const res = await qaPhotoAction({ imagePath: "/images/lena-group.jpg" });
    expect(res.error).toBeNull();
    expect(res.data).toEqual(needsWorkResult);
  });

  it("returns a calm error when the file is missing", async () => {
    readFileMock.mockRejectedValueOnce(new Error("ENOENT"));
    const res = await qaPhotoAction({ imagePath: "/images/lena.jpg" });
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/couldn't be found/i);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("surfaces a calm quota message and never reads the file or calls the model", async () => {
    assertAiQuotaMock.mockRejectedValueOnce(new QuotaError("limit"));
    const res = await qaPhotoAction({ imagePath: "/images/lena.jpg" });
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/paused/i);
    expect(readFileMock).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("surfaces a calm error (no raw text) when the model is unavailable", async () => {
    generateStructuredMock.mockRejectedValueOnce(new AiUnavailableError("secret internal detail"));
    const res = await qaPhotoAction({ imagePath: "/images/lena.jpg" });
    expect(res.data).toBeNull();
    expect(res.error).not.toMatch(/secret internal/);
  });
});

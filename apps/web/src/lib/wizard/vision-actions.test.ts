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
import { qaPhotoAction, uploadTargetPhotoAction } from "./vision-actions";

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

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const makeFile = (bytes: Uint8Array = PNG, type = "image/png") =>
  new File([bytes as BlobPart], "photo.png", { type });
const withPhoto = (file: File | null, extra: Record<string, string> = {}) => {
  const fd = new FormData();
  if (file) fd.append("photo", file);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return fd;
};

describe("uploadTargetPhotoAction", () => {
  let uploadMock: ReturnType<typeof vi.fn>;
  let removeMock: ReturnType<typeof vi.fn>;
  let fromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    uploadMock = vi.fn().mockResolvedValue({ data: { path: "p" }, error: null });
    removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    fromMock = vi.fn(() => ({ upload: uploadMock, remove: removeMock }));
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: { storage: { from: fromMock } },
    });
  });

  it("rejects a spoofed/non-image file before touching storage or the model", async () => {
    const res = await uploadTargetPhotoAction(withPhoto(makeFile(GIF, "image/png")));
    expect(res.data).toBeNull();
    expect(res.error).toMatch(/JPG, PNG, or WebP/i);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("rejects a request with no photo field", async () => {
    const res = await uploadTargetPhotoAction(withPhoto(null));
    expect(res.data).toBeNull();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("uploads under the caregiver's own uid folder and returns the QA verdict", async () => {
    generateStructuredMock.mockResolvedValueOnce(goodResult);
    const res = await uploadTargetPhotoAction(withPhoto(makeFile()));
    expect(res.error).toBeNull();
    expect(res.data?.qa).toEqual(goodResult);
    expect(res.data?.path).toMatch(/^u1\/[\w-]+\.png$/);

    expect(fromMock).toHaveBeenCalledWith("target-photos");
    const [path, body, opts] = uploadMock.mock.calls[0];
    expect(path).toBe(res.data?.path);
    expect(body).toBeInstanceOf(Uint8Array);
    expect(opts).toMatchObject({ contentType: "image/png", upsert: false });
  });

  it("passes the memory target through for crop advice", async () => {
    generateStructuredMock.mockResolvedValueOnce(needsWorkResult);
    await uploadTargetPhotoAction(
      withPhoto(makeFile(), { question: "Who is this?", answer: "Lena" }),
    );
    const text = generateStructuredMock.mock.calls[0][0].user[1].text as string;
    expect(text).toContain("Who is this?");
    expect(text).toContain("Lena");
  });

  it("does not upload or call the model when quota is exhausted", async () => {
    assertAiQuotaMock.mockRejectedValueOnce(new QuotaError("limit"));
    const res = await uploadTargetPhotoAction(withPhoto(makeFile()));
    expect(res.error).toMatch(/paused/i);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("returns a calm error when storage upload fails, without calling the model", async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: { message: "bucket boom" } });
    const res = await uploadTargetPhotoAction(withPhoto(makeFile()));
    expect(res.data).toBeNull();
    expect(res.error).not.toMatch(/bucket boom/);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("removes the stored object and returns a calm error when QA fails after upload", async () => {
    generateStructuredMock.mockRejectedValueOnce(new AiUnavailableError("secret internal detail"));
    const res = await uploadTargetPhotoAction(withPhoto(makeFile()));
    expect(res.data).toBeNull();
    expect(res.error).not.toMatch(/secret internal/);
    expect(removeMock).toHaveBeenCalledTimes(1);
    const uploadedPath = uploadMock.mock.calls[0][0];
    expect(removeMock).toHaveBeenCalledWith([uploadedPath]);
  });
});

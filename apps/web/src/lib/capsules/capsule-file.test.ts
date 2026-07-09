import { describe, expect, it } from "vitest";
import {
  capsuleObjectPath,
  isOwnedCapsulePath,
  kindForMime,
  MAX_PHOTO_BYTES,
  MAX_VIDEO_BYTES,
  sniffCapsuleMime,
  validateCapsuleBytes,
} from "./capsule-file";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
// "....ftyp...." — bytes 4..7 = f t y p
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
const UID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("sniffCapsuleMime", () => {
  it("recognises each allowed format from its magic bytes", () => {
    expect(sniffCapsuleMime(JPEG)).toBe("image/jpeg");
    expect(sniffCapsuleMime(PNG)).toBe("image/png");
    expect(sniffCapsuleMime(WEBP)).toBe("image/webp");
    expect(sniffCapsuleMime(MP4)).toBe("video/mp4");
    expect(sniffCapsuleMime(WEBM)).toBe("video/webm");
  });

  it("returns null for a disallowed type (e.g. a renamed SVG / script vector)", () => {
    const svg = new Uint8Array([0x3c, 0x73, 0x76, 0x67]); // "<svg"
    expect(sniffCapsuleMime(svg)).toBeNull();
    expect(sniffCapsuleMime(new Uint8Array([]))).toBeNull();
  });
});

describe("kindForMime", () => {
  it("maps mime to photo/video kind", () => {
    expect(kindForMime("image/jpeg")).toBe("photo");
    expect(kindForMime("video/mp4")).toBe("video");
    expect(kindForMime("video/webm")).toBe("video");
  });
});

describe("validateCapsuleBytes", () => {
  it("accepts a valid photo within the photo cap", () => {
    expect(validateCapsuleBytes(JPEG)).toEqual({ ok: true, mime: "image/jpeg", kind: "photo" });
  });

  it("accepts a valid video within the video cap", () => {
    expect(validateCapsuleBytes(MP4)).toEqual({ ok: true, mime: "video/mp4", kind: "video" });
  });

  it("rejects empty bytes", () => {
    expect(validateCapsuleBytes(new Uint8Array([]))).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a disallowed type", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38]); // "GIF8"
    expect(validateCapsuleBytes(gif)).toEqual({ ok: false, reason: "bad_type" });
  });

  it("enforces the per-kind size cap: a photo over 5 MiB is too_large even below the video cap", () => {
    // A JPEG-headed blob larger than the photo cap but smaller than the video cap: proves the cap
    // is chosen by sniffed kind, not the bucket-wide limit.
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(big.length).toBeLessThan(MAX_VIDEO_BYTES);
    expect(validateCapsuleBytes(big)).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("capsuleObjectPath", () => {
  it("keys the object under the caregiver's own folder with the mime's extension", () => {
    expect(capsuleObjectPath(UID, "image/png", UID)).toBe(`${UID}/${UID}.png`);
    expect(capsuleObjectPath(UID, "video/mp4", UID)).toBe(`${UID}/${UID}.mp4`);
    expect(capsuleObjectPath(UID, "video/webm", UID)).toBe(`${UID}/${UID}.webm`);
  });
});

describe("isOwnedCapsulePath (ownership gate)", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const file = "22222222-2222-4222-8222-222222222222.mp4";

  it("accepts a well-formed key under the caller's own folder", () => {
    expect(isOwnedCapsulePath(`${owner}/${file}`, owner)).toBe(true);
    expect(isOwnedCapsulePath(`${owner}/${UID}.png`, owner)).toBe(true);
  });

  it("rejects a key under ANOTHER caregiver's folder (no cross-tenant sign/persist)", () => {
    expect(isOwnedCapsulePath(`someone-else/${file}`, owner)).toBe(false);
  });

  it("rejects nested folders and traversal attempts", () => {
    expect(isOwnedCapsulePath(`${owner}/nested/${file}`, owner)).toBe(false);
    expect(isOwnedCapsulePath(`${owner}/../${owner}/${file}`, owner)).toBe(false);
  });

  it("rejects a disallowed extension", () => {
    expect(isOwnedCapsulePath(`${owner}/${UID}.svg`, owner)).toBe(false);
    expect(isOwnedCapsulePath(`${owner}/${UID}.exe`, owner)).toBe(false);
  });

  it("rejects malformed keys (no folder, trailing slash, empty)", () => {
    expect(isOwnedCapsulePath(file, owner)).toBe(false);
    expect(isOwnedCapsulePath(`${owner}/`, owner)).toBe(false);
    expect(isOwnedCapsulePath("", owner)).toBe(false);
  });
});

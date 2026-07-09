import { describe, expect, it } from "vitest";
import {
  isOwnedPhotoPath,
  isPhotoObjectPath,
  MAX_PHOTO_BYTES,
  type PhotoMime,
  photoObjectPath,
  sniffPhotoMime,
  validatePhotoBytes,
} from "./photo-upload";

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = () =>
  new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe("sniffPhotoMime", () => {
  it("detects JPEG, PNG, and WEBP from magic bytes", () => {
    expect(sniffPhotoMime(jpeg())).toBe("image/jpeg");
    expect(sniffPhotoMime(png())).toBe("image/png");
    expect(sniffPhotoMime(webp())).toBe("image/webp");
  });

  it("rejects unknown / spoofed content (returns null, never a guess)", () => {
    // A GIF header, an SVG-ish text blob, and a truncated PNG must all be refused.
    expect(sniffPhotoMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
    expect(sniffPhotoMime(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))).toBeNull();
    expect(sniffPhotoMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
    expect(sniffPhotoMime(new Uint8Array([]))).toBeNull();
  });

  it("does not treat a RIFF container that is not WEBP as an image", () => {
    // "RIFF" + "AVI " — a real RIFF but not WEBP.
    const avi = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]);
    expect(sniffPhotoMime(avi)).toBeNull();
  });
});

describe("validatePhotoBytes", () => {
  it("accepts a real image and reports its sniffed mime", () => {
    expect(validatePhotoBytes(png())).toEqual({ ok: true, mime: "image/png" });
  });

  it("rejects empty input", () => {
    expect(validatePhotoBytes(new Uint8Array([]))).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects oversize input before looking at bytes", () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(jpeg()); // even a valid header must not rescue an over-limit file
    expect(validatePhotoBytes(big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects a real file of a disallowed type", () => {
    expect(validatePhotoBytes(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toEqual({
      ok: false,
      reason: "bad_type",
    });
  });

  it("allows a file exactly at the size limit", () => {
    const atLimit = new Uint8Array(MAX_PHOTO_BYTES);
    atLimit.set(png());
    expect(validatePhotoBytes(atLimit)).toEqual({ ok: true, mime: "image/png" });
  });
});

describe("photoObjectPath", () => {
  it("scopes the object under the caregiver's uid folder with the right extension", () => {
    const cases: [PhotoMime, string][] = [
      ["image/jpeg", "jpg"],
      ["image/png", "png"],
      ["image/webp", "webp"],
    ];
    for (const [mime, ext] of cases) {
      const path = photoObjectPath("cg-123", mime, "uuid-abc");
      expect(path).toBe(`cg-123/uuid-abc.${ext}`);
      // The first segment is the RLS ownership key — it must be exactly the caregiver id.
      expect(path.split("/")[0]).toBe("cg-123");
    }
  });
});

const UID = "11111111-1111-4111-8111-111111111111";
const UUID = "22222222-2222-4222-8222-222222222222";
const ownKey = (ext = "png") => `${UID}/${UUID}.${ext}`;

describe("isPhotoObjectPath (shape gate before signing)", () => {
  it("accepts a well-formed <folder>/<uuid>.<ext> key for each allowed extension", () => {
    for (const ext of ["jpg", "png", "webp"]) expect(isPhotoObjectPath(ownKey(ext))).toBe(true);
  });

  it("rejects traversal, nested folders, missing/foreign extensions, and empty segments", () => {
    expect(isPhotoObjectPath(`${UID}/${UUID}.svg`)).toBe(false); // disallowed (script vector) type
    expect(isPhotoObjectPath(`${UID}/${UUID}`)).toBe(false); // no extension
    expect(isPhotoObjectPath(`${UID}/sub/${UUID}.png`)).toBe(false); // nested folder
    expect(isPhotoObjectPath(`${UID}/../secret.png`)).toBe(false); // traversal
    expect(isPhotoObjectPath(`/${UUID}.png`)).toBe(false); // empty folder segment
    expect(isPhotoObjectPath(`${UID}/`)).toBe(false); // empty file segment
    expect(isPhotoObjectPath(UUID)).toBe(false); // no slash at all
  });
});

describe("isOwnedPhotoPath (per-caregiver ownership gate)", () => {
  it("accepts a key whose folder is exactly the caregiver's uid", () => {
    expect(isOwnedPhotoPath(ownKey(), UID)).toBe(true);
  });

  it("rejects a well-formed key under ANOTHER caregiver's folder", () => {
    // The security property: a caregiver can never attach or sign an object outside their own folder.
    expect(isOwnedPhotoPath(`33333333-3333-4333-8333-333333333333/${UUID}.png`, UID)).toBe(false);
  });

  it("rejects a malformed filename even under the caller's own folder", () => {
    expect(isOwnedPhotoPath(`${UID}/${UUID}.gif`, UID)).toBe(false);
    expect(isOwnedPhotoPath(`${UID}/evil.png`, UID)).toBe(false);
  });
});

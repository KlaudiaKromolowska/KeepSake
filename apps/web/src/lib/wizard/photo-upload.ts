/**
 * Pure validation + path helpers for caregiver photo upload — deliberately NOT in the `"use server"`
 * action file (which may only export async functions). Everything here is sync, side-effect-free,
 * and unit-tested: the untrusted-input gate for a bucket that holds Article-9-adjacent images.
 */

export const PHOTO_BUCKET = "target-photos";

/** Mirrors the bucket's `file_size_limit` (5 MiB) — enforced server-side too; never trust the
 * bucket limit alone, and never trust the browser's reported size. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";

const EXT_FOR_MIME: Record<PhotoMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Sniff the real image type from magic bytes. The client-supplied Content-Type is untrusted (an
 * attacker can lie about it, and the bucket's allowed_mime_types check trusts that same header), so
 * the actual bytes are the source of truth for what we persist. Returns null for anything that is
 * not one of the three allowed formats — including a renamed executable or SVG (script vector).
 */
export function sniffPhotoMime(bytes: Uint8Array): PhotoMime | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type PhotoValidation =
  | { ok: true; mime: PhotoMime }
  | { ok: false; reason: "empty" | "too_large" | "bad_type" };

/** The single server-side gate: non-empty, within the size cap, and a real allowed image format. */
export function validatePhotoBytes(bytes: Uint8Array): PhotoValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_PHOTO_BYTES) return { ok: false, reason: "too_large" };
  const mime = sniffPhotoMime(bytes);
  if (!mime) return { ok: false, reason: "bad_type" };
  return { ok: true, mime };
}

/**
 * Storage object key: `<caregiverId>/<uuid>.<ext>`. The leading folder segment is the RLS ownership
 * key (see the migration) — it MUST be the caller's own uid, never client-supplied, so callers pass
 * the server-resolved `user.id` here.
 */
export function photoObjectPath(caregiverId: string, mime: PhotoMime, uuid: string): string {
  return `${caregiverId}/${uuid}.${EXT_FOR_MIME[mime]}`;
}

/**
 * Pure validation + path helpers for memory-capsule upload — sync, side-effect-free, unit-tested.
 * The untrusted-input gate for a private bucket that holds family Article-9-adjacent photos AND
 * short videos. Mirrors `wizard/photo-upload.ts`, extended to the two video formats the reward can
 * play. Kept out of the `"use server"` action file (which may only export async functions).
 */

export const CAPSULE_BUCKET = "memory-capsules";

/** Per-kind size caps enforced server-side. Photos match the target-photos cap (5 MiB); videos are
 * a short family clip only — a hard 25 MiB bound mirrors the bucket's `file_size_limit`. Never trust
 * the bucket limit or the browser-reported size alone. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export type CapsuleMime = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm";

export type CapsuleKind = "photo" | "video";

const EXT_FOR_MIME: Record<CapsuleMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

export function kindForMime(mime: CapsuleMime): CapsuleKind {
  return mime.startsWith("video/") ? "video" : "photo";
}

/**
 * Sniff the real media type from magic bytes. The client-supplied Content-Type is untrusted (an
 * attacker can lie about it, and the bucket's allowed_mime_types trusts that same header), so the
 * actual bytes are the source of truth. Returns null for anything not on the allowlist — including a
 * renamed executable or an SVG (script vector). Video sniffing is deliberately conservative: MP4/MOV
 * via the `ftyp` box, WebM/Matroska via the EBML signature.
 */
export function sniffCapsuleMime(bytes: Uint8Array): CapsuleMime | null {
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
  // MP4 / QuickTime: bytes 4..7 spell "ftyp" (the file-type box). Sniffed as video/mp4 (the browser
  // plays MOV's H.264 payload as mp4 in practice; the allowlist stores it under the mp4 label).
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "video/mp4";
  }
  // WebM / Matroska: EBML header 1A 45 DF A3
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  return null;
}

export type CapsuleValidation =
  | { ok: true; mime: CapsuleMime; kind: CapsuleKind }
  | { ok: false; reason: "empty" | "too_large" | "bad_type" };

/** The single server-side gate: non-empty, a real allowed media format, and within the per-kind cap
 *  (photo 5 MiB / video 25 MiB — the type is decided from the bytes, then the matching cap applies). */
export function validateCapsuleBytes(bytes: Uint8Array): CapsuleValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  const mime = sniffCapsuleMime(bytes);
  if (!mime) return { ok: false, reason: "bad_type" };
  const kind = kindForMime(mime);
  const cap = kind === "video" ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
  if (bytes.length > cap) return { ok: false, reason: "too_large" };
  return { ok: true, mime, kind };
}

/**
 * Storage object key: `<caregiverId>/<uuid>.<ext>`. The leading folder segment is the RLS ownership
 * key (see the migration) — it MUST be the caller's own uid, never client-supplied, so callers pass
 * the server-resolved `user.id` here.
 */
export function capsuleObjectPath(caregiverId: string, mime: CapsuleMime, uuid: string): string {
  return `${caregiverId}/${uuid}.${EXT_FOR_MIME[mime]}`;
}

/** A `<uuid>.<ext>` capsule object filename — the second segment of a capsule object key. */
const CAPSULE_FILENAME_RE = /^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/i;

/** Split a `<folder>/<file>` key once; null unless it is exactly two non-empty, slash-free segments. */
function splitObjectKey(path: string): { folder: string; file: string } | null {
  const slash = path.indexOf("/");
  if (slash <= 0 || slash === path.length - 1) return null;
  const file = path.slice(slash + 1);
  if (file.includes("/")) return null; // no nested folders — the bucket is flat per caregiver
  return { folder: path.slice(0, slash), file };
}

/**
 * True iff `path` is a well-formed capsule key whose owning folder is exactly `caregiverId`. Used at
 * the two untrusted boundaries: persisting/removing a client-referenced object (a caregiver may only
 * touch their OWN object), and — belt-and-braces over storage RLS — before signing one.
 */
export function isOwnedCapsulePath(path: string, caregiverId: string): boolean {
  const parts = splitObjectKey(path);
  return parts !== null && parts.folder === caregiverId && CAPSULE_FILENAME_RE.test(parts.file);
}

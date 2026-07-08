/**
 * Pure schema + path-validation logic for the vision photo QA feature — deliberately NOT in
 * vision-actions.ts: that file is `"use server"`, and Next.js requires every export from a server
 * module to be an async function, so non-function/sync exports (zod schemas, `resolveImagePath`)
 * live here instead.
 */
import { resolve, sep } from "node:path";
import { z } from "zod";

const IMAGE_PATH_RE = /^\/images\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/;
const PUBLIC_DIR = resolve(process.cwd(), "public");
const IMAGES_DIR = resolve(PUBLIC_DIR, "images");

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

const MEDIA_TYPES: Record<string, ImageMediaType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function mediaTypeFor(imagePath: string): ImageMediaType {
  const ext = imagePath.split(".").pop() ?? "";
  return MEDIA_TYPES[ext] ?? "image/jpeg";
}

/**
 * Two independent, defense-in-depth checks: the regex allowlists the shape (no dots/slashes in the
 * filename stem, a known extension, no subdirectories), and the resolve+prefix check confirms the
 * canonical path still lands inside `public/images` — belt-and-braces against traversal even if the
 * regex were ever loosened. Returns null (never throws) on any rejection so callers get a calm error.
 */
export function resolveImagePath(imagePath: string): string | null {
  if (!IMAGE_PATH_RE.test(imagePath)) return null;
  const abs = resolve(PUBLIC_DIR, `.${imagePath}`);
  return abs.startsWith(IMAGES_DIR + sep) ? abs : null;
}

/** Optional memory-target context (question + answer ONLY — data minimization) so the vision
 * call can point crop advice at the subject the target is about. Bounds match the wizard
 * proposal schema. */
export const qaPhotoInputSchema = z
  .object({
    imagePath: z.string().regex(IMAGE_PATH_RE),
    target: z
      .object({
        question: z.string().trim().min(1).max(300),
        answer: z.string().trim().min(1).max(120),
      })
      .strict()
      .optional(),
  })
  .strict();

export type QaPhotoInput = z.infer<typeof qaPhotoInputSchema>;

/** The vision structured-output schema — ALSO the Anthropic `zodOutputFormat` schema. */
export const photoQaSchema = z.object({
  verdict: z.enum(["good", "needs_work"]),
  reasons: z.array(z.string().min(1).max(200)).max(6),
  cropAdvice: z.string().min(1).max(200).nullable(),
});

export type PhotoQaResult = z.infer<typeof photoQaSchema>;

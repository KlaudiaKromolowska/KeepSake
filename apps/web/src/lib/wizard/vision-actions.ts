"use server";

import { readFile } from "node:fs/promises";
import { buildVisionUserText, VISION_SYSTEM_PROMPT } from "@keepsake/core/prompts/vision";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { AiUnavailableError, assertAiQuota, generateStructured, QuotaError } from "@/lib/ai/core";
import { WIZARD_COPY } from "./copy";
import { PHOTO_BUCKET, type PhotoMime, photoObjectPath, validatePhotoBytes } from "./photo-upload";
import {
  type ImageMediaType,
  mediaTypeFor,
  type PhotoQaResult,
  photoQaSchema,
  qaPhotoInputSchema,
  resolveImagePath,
  visionTargetSchema,
} from "./vision-schema";

// EN only for the hackathon; locale is plumbed through the prompt for V1 (PLAN §8b out-of-scope).
const LOCALE = "en";

const C = WIZARD_COPY.photoQa;
const zerr = (issues: { message: string }[]) => issues.map((i) => i.message).join("; ");

/** The one Claude vision call, shared by the seeded-photo check and the caregiver upload path.
 * Untrusted model output is gated by `photoQaSchema` (inside `generateStructured`) before it
 * returns. Callers own quota + error mapping so each entry point keeps its own ordering. */
async function generatePhotoQa(
  base64: string,
  mediaType: ImageMediaType,
  target?: { question: string; answer: string },
): Promise<PhotoQaResult> {
  return generateStructured({
    kind: "vision",
    schema: photoQaSchema,
    system: VISION_SYSTEM_PROMPT,
    user: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: buildVisionUserText(LOCALE, target) },
    ],
    effort: "medium",
    maxTokens: 2048,
  });
}

/**
 * Judge whether a SEEDED photo (bundled in `public/images`) works as a dual-coding memory cue.
 * Flow: validate input (allowlist path shape + confine to public/images) → quota → read the file
 * server-side → base64 → Claude vision call. A missing/invalid file or a Claude failure both return
 * a calm error result — this feature never blocks target creation, it is an optional check.
 */
export async function qaPhotoAction(input: unknown): Promise<ActionResult<PhotoQaResult>> {
  const parsed = qaPhotoInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };

  const { supabase } = await requireUser();

  try {
    await assertAiQuota(supabase, "vision");
  } catch (err) {
    if (err instanceof QuotaError) return { data: null, error: C.errors.quota };
    return failAction("qaPhoto: quota", err, C.errors.unavailable);
  }

  const absPath = resolveImagePath(parsed.data.imagePath);
  if (!absPath) return { data: null, error: C.errors.missing };

  let base64: string;
  try {
    base64 = (await readFile(absPath)).toString("base64");
  } catch {
    return { data: null, error: C.errors.missing };
  }

  try {
    const result = await generatePhotoQa(
      base64,
      mediaTypeFor(parsed.data.imagePath),
      parsed.data.target,
    );
    return { data: result, error: null };
  } catch (err) {
    if (err instanceof AiUnavailableError) return { data: null, error: C.errors.unavailable };
    return failAction("qaPhoto: generate", err, C.errors.unavailable);
  }
}

const REASON_COPY: Record<"empty" | "too_large" | "bad_type", string> = {
  empty: C.errors.uploadFailed,
  too_large: C.errors.tooLarge,
  bad_type: C.errors.badType,
};

export type PhotoUploadResult = { path: string; qa: PhotoQaResult };

/**
 * Upload a caregiver's OWN photo to the private `target-photos` bucket, then run the same vision QA
 * on it. Every byte is untrusted: we read the file server-side, validate size + real image type by
 * magic bytes (never the client's Content-Type), and store it under `<caregiver_id>/<uuid>.<ext>` so
 * storage RLS confines it to this caregiver. Upload uses the RLS'd user client — the object's owner
 * folder is the server-resolved `user.id`, so a forged path can never escape the caller's tenant.
 * If the QA call fails after a successful upload we remove the just-stored object (best effort) so a
 * failed check never leaves an unchecked orphan behind.
 */
export async function uploadTargetPhotoAction(
  formData: FormData,
): Promise<ActionResult<PhotoUploadResult>> {
  const file = formData.get("photo");
  if (!(file instanceof File)) return { data: null, error: C.errors.uploadFailed };

  // Optional target context for crop advice — validated with the same bounds as the seeded path.
  const rawTarget = { question: formData.get("question"), answer: formData.get("answer") };
  let target: { question: string; answer: string } | undefined;
  if (typeof rawTarget.question === "string" && typeof rawTarget.answer === "string") {
    const t = visionTargetSchema.safeParse(rawTarget);
    if (t.success) target = t.data;
  }

  const { user, supabase } = await requireUser();

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { data: null, error: C.errors.uploadFailed };
  }

  const check = validatePhotoBytes(bytes);
  if (!check.ok) return { data: null, error: REASON_COPY[check.reason] };
  const mime: PhotoMime = check.mime;

  try {
    await assertAiQuota(supabase, "vision");
  } catch (err) {
    if (err instanceof QuotaError) return { data: null, error: C.errors.quota };
    return failAction("uploadPhoto: quota", err, C.errors.unavailable);
  }

  const path = photoObjectPath(user.id, mime, crypto.randomUUID());
  const { error: uploadErr } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadErr) return failAction("uploadPhoto: storage", uploadErr, C.errors.uploadFailed);

  try {
    const qa = await generatePhotoQa(Buffer.from(bytes).toString("base64"), mime, target);
    return { data: { path, qa }, error: null };
  } catch (err) {
    // The photo is stored but unchecked — drop it so the caregiver isn't left with a silent orphan.
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (err instanceof AiUnavailableError) return { data: null, error: C.errors.unavailable };
    return failAction("uploadPhoto: generate", err, C.errors.unavailable);
  }
}

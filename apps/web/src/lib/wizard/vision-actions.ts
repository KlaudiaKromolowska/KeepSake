"use server";

import { readFile } from "node:fs/promises";
import { buildVisionUserText, VISION_SYSTEM_PROMPT } from "@keepsake/core/prompts/vision";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { AiUnavailableError, assertAiQuota, generateStructured, QuotaError } from "@/lib/ai/core";
import { WIZARD_COPY } from "./copy";
import {
  mediaTypeFor,
  type PhotoQaResult,
  photoQaSchema,
  qaPhotoInputSchema,
  resolveImagePath,
} from "./vision-schema";

// EN only for the hackathon; locale is plumbed through the prompt for V1 (PLAN §8b out-of-scope).
const LOCALE = "en";

const zerr = (issues: { message: string }[]) => issues.map((i) => i.message).join("; ");

/**
 * Judge whether a photo works as a dual-coding memory cue. Flow: validate input (allowlist path
 * shape + confine to public/images) → quota → read the file server-side → base64 → Claude vision
 * call. A missing/invalid file or a Claude failure both return a calm error result — this feature
 * never blocks target creation, it is an optional check the caregiver runs before saving a photo.
 */
export async function qaPhotoAction(input: unknown): Promise<ActionResult<PhotoQaResult>> {
  const parsed = qaPhotoInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };

  const { supabase } = await requireUser();

  try {
    await assertAiQuota(supabase, "vision");
  } catch (err) {
    if (err instanceof QuotaError) return { data: null, error: WIZARD_COPY.photoQa.errors.quota };
    return failAction("qaPhoto: quota", err, WIZARD_COPY.photoQa.errors.unavailable);
  }

  const absPath = resolveImagePath(parsed.data.imagePath);
  if (!absPath) return { data: null, error: WIZARD_COPY.photoQa.errors.missing };

  let base64: string;
  try {
    base64 = (await readFile(absPath)).toString("base64");
  } catch {
    return { data: null, error: WIZARD_COPY.photoQa.errors.missing };
  }

  try {
    const result = await generateStructured({
      kind: "vision",
      schema: photoQaSchema,
      system: VISION_SYSTEM_PROMPT,
      user: [
        {
          type: "image",
          source: { type: "base64", media_type: mediaTypeFor(parsed.data.imagePath), data: base64 },
        },
        { type: "text", text: buildVisionUserText(LOCALE, parsed.data.target) },
      ],
      effort: "medium",
      maxTokens: 2048,
    });
    return { data: result, error: null };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { data: null, error: WIZARD_COPY.photoQa.errors.unavailable };
    }
    return failAction("qaPhoto: generate", err, WIZARD_COPY.photoQa.errors.unavailable);
  }
}

import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";

/** targets.accepted_variants Json column → string[]; anything malformed contributes nothing. */
export const aliasesFromJson = (json: Json | null): string[] =>
  Array.isArray(json) ? json.filter((v): v is string => typeof v === "string") : [];

/** Client → gradeRecallAction. The transcript is untrusted ASR text; cap it hard at the boundary. */
export const gradeInputSchema = z.object({
  targetId: z.uuid("A valid target id is required."),
  transcript: z
    .string()
    .trim()
    .min(1, "A transcript is required.")
    .max(400, "Transcript too long."),
});

/** Haiku output — schema-validated before the verdict can influence anything. */
export const gradeVerdictSchema = z.object({
  verdict: z.enum(["recall", "miss", "unclear"]),
});

export type GradeSuggestion = { suggestion: "recall" | "miss" | null };

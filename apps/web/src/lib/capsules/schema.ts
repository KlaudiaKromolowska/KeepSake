import { z } from "zod";

/**
 * A caption is optional (data minimization) and short. It is family text, never clinical — the
 * length bound is a UX/abuse guard, not a content filter, but keeping it brief and trimming
 * whitespace keeps stray PII/notes out of a field that only labels a photo.
 */
export const captionSchema = z.string().trim().max(120);

/** Persist metadata for an already-validated, already-stored capsule object. patientId is checked
 *  against ownership server-side before insert; storagePath is re-gated against the caller's uid. */
export const addCapsuleSchema = z.object({
  patientId: z.uuid(),
  caption: captionSchema.optional(),
});

/** Remove one capsule (its row + storage object). RLS scopes the delete to the caller's own rows. */
export const removeCapsuleSchema = z.object({
  capsuleId: z.uuid(),
});

export type AddCapsuleInput = z.infer<typeof addCapsuleSchema>;
export type RemoveCapsuleInput = z.infer<typeof removeCapsuleSchema>;

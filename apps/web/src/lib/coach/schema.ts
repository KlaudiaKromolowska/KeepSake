import { z } from "zod";

/** Caps on the untrusted transcript sent to the model — bounds prompt size and abuse surface. */
export const COACH_MAX_TURNS = 24;
export const COACH_MAX_CONTENT = 1000;

/**
 * Request body for POST /api/coach: the whole conversation, oldest-first. Roles are constrained to
 * user/assistant, content is length-bounded, the array is capped, and the last turn must be the
 * caregiver's (the message we answer). `.strict()` rejects any extra keys.
 */
export const coachRequestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(COACH_MAX_CONTENT),
          })
          .strict(),
      )
      .min(1)
      .max(COACH_MAX_TURNS)
      .refine((m) => m[m.length - 1]?.role === "user", {
        message: "The last message must be from the caregiver.",
      }),
  })
  .strict();

export type CoachRequest = z.infer<typeof coachRequestSchema>;

/**
 * Model output contract — validated before anything is returned to the client (generateStructured
 * parses against this and throws on mismatch). `reply` is the caregiver-facing text; `escalate` is
 * the model's safety signal that the UI elevates into a crisis pointer. `.strict()` so a malformed
 * or padded object never reaches the client.
 */
export const coachReplySchema = z
  .object({
    reply: z.string().trim().min(1).max(2000),
    escalate: z.boolean(),
  })
  .strict();

export type CoachReply = z.infer<typeof coachReplySchema>;

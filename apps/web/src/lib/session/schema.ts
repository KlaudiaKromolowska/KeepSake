import { z } from "zod";

/** Outcome union — mirrors `@keepsake/core/sr` `Outcome`. */
export const outcomeSchema = z.enum(["recall", "miss", "unclear"]);

/** One probe result — mirrors core `TrialRecord` (boundary-computed columns excluded). */
export const trialRecordSchema = z
  .object({
    intervalSec: z.number().int().min(0).max(86_400),
    outcome: outcomeSchema,
    isScreening: z.boolean(),
    corrected: z.boolean(),
    at: z.number().int().positive(),
  })
  .strict();

/** Cross-session per-target progress — mirrors core `TargetProgress`. */
export const targetProgressSchema = z
  .object({
    lastSuccessSec: z.number().int().min(0).nullable(),
    startStreak: z.number().int().min(0),
    lastStartSuccessDay: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    badSessions: z.number().int().min(0),
    mastered: z.boolean(),
    sessionCount: z.number().int().min(0),
  })
  .strict();

/**
 * Full session snapshot — mirrors core `SessionState`. This is CLIENT data on the way back in
 * (the kiosk drives the reducer client-side), so it is zod-validated before it ever reaches
 * `resumeSession` or the scheduler handoff.
 */
export const sessionStateSchema = z
  .object({
    phase: z.enum(["teach", "distractor", "awaiting_probe", "correcting", "end_on_win", "ended"]),
    intervalSec: z.number().int().min(0),
    baseMisses: z.number().int().min(0),
    unclearRun: z.number().int().min(0),
    startedAt: z.number().int().positive(),
    startedDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: z.string().min(1),
    isStartProbe: z.boolean(),
    progress: targetProgressSchema,
    trials: z.array(trialRecordSchema).max(500),
    endReason: z.enum(["ceiling", "struggle", "caregiver", "mastered"]).nullable(),
    handoffToScheduler: z.boolean(),
    rescopeRequired: z.boolean(),
  })
  .strict();

export const startSessionInputSchema = z.object({ targetId: z.string().uuid() }).strict();

export const recordTrialInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    targetId: z.string().uuid(),
    trial: trialRecordSchema,
    snapshot: sessionStateSchema,
  })
  .strict();

export const endSessionInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    targetId: z.string().uuid(),
    snapshot: sessionStateSchema,
  })
  .strict();

export const saveSessionNoteInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    note: z.string().min(1).max(2000),
  })
  .strict();

export const annotateSessionInputSchema = z
  .object({
    sessionId: z.string().uuid(),
    kind: z.enum(["answer_card", "interval_override"]),
    note: z.string().max(300).optional(),
    fromSec: z.number().int().min(0).optional(),
    toSec: z.number().int().min(0).optional(),
    at: z.number().int().positive(),
  })
  .strict();

export type SessionStateInput = z.infer<typeof sessionStateSchema>;
export type TrialRecordInput = z.infer<typeof trialRecordSchema>;
export type AnnotateSessionInput = z.infer<typeof annotateSessionInputSchema>;

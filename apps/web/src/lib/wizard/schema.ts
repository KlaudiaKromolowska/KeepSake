import { z } from "zod";
import { ETIOLOGY_VALUES } from "@/lib/patients/schema";

/**
 * The wizard's structured-output schema — ALSO the Anthropic `zodOutputFormat` schema, so it must
 * describe exactly what the model returns. Every field is required: the model MUST produce a first
 * draft and reject it (`selfCritique`), which the page renders visibly. Bounds here are generous
 * guards against runaway output; the real authoring rules live in `rules.ts` and run after parse.
 */
export const wizardProposalSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(120),
  acceptedVariants: z.array(z.string().min(1).max(80)).max(10),
  answerFormat: z.enum(["free_recall", "recognition"]),
  redFlags: z.array(z.string().min(1).max(200)).max(8),
  rationale: z.string().min(1).max(600),
  selfCritique: z.object({
    rejectedDraft: z.object({
      question: z.string().min(1).max(300),
      answer: z.string().min(1).max(120),
    }),
    reason: z.string().min(1).max(400),
  }),
});

export type WizardProposal = z.infer<typeof wizardProposalSchema>;

/** Input to `generateTargetAction`: the untrusted caregiver description + an optional etiology hint. */
export const generateTargetInputSchema = z
  .object({
    description: z.string().trim().min(10, "Please add a little more detail.").max(500),
    etiologyHint: z.enum(ETIOLOGY_VALUES).optional(),
  })
  .strict();

export type GenerateTargetInput = z.infer<typeof generateTargetInputSchema>;

/**
 * Input to `createTargetAction` (persistence). Used by BOTH the accept-proposal path and the
 * hand-entry form, so it must stand alone without Claude. Bounds match the SR authoring rules.
 */
export const createTargetInputSchema = z
  .object({
    question: z.string().trim().min(1).max(120),
    answer: z.string().trim().min(1).max(40),
    acceptedVariants: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
    answerFormat: z.enum(["free_recall", "recognition"]).default("free_recall"),
  })
  .strict();

export type CreateTargetInput = z.infer<typeof createTargetInputSchema>;

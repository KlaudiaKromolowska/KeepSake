"use server";

import { buildWizardPrompt, refineUserMessage } from "@keepsake/core/prompts/wizard";
import type { ActionResult } from "@/lib/actions";
import { failAction, requireUser } from "@/lib/actions";
import { AiUnavailableError, assertAiQuota, generateStructured, QuotaError } from "@/lib/ai/core";
import type { Json } from "@/lib/supabase/database.types";
import { WIZARD_COPY } from "./copy";
import { isOwnedPhotoPath } from "./photo-upload";
import { normalizeVariants, validateTarget } from "./rules";
import {
  createTargetInputSchema,
  generateTargetInputSchema,
  type WizardProposal,
  wizardProposalSchema,
} from "./schema";

const zerr = (issues: { message: string }[]) => issues.map((i) => i.message).join("; ");

// EN only for the hackathon; locale is plumbed through the prompt for V1 (PLAN §8b out-of-scope).
const LOCALE = "en";

/**
 * Turn a messy caregiver description into a single SR target proposal with a visible self-critique.
 * NEVER persists — it returns the proposal for the caregiver to accept, adjust, or discard.
 * Flow: validate input → quota → Claude → code-side rules → ONE corrective re-ask on violations →
 * still failing ⇒ calm error (the UI then offers hand-entry). Claude output is untrusted: the zod
 * schema (inside the core) and `validateTarget` both gate it before it ever reaches the caregiver.
 */
export async function generateTargetAction(input: unknown): Promise<ActionResult<WizardProposal>> {
  const parsed = generateTargetInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };

  const { supabase } = await requireUser();

  try {
    await assertAiQuota(supabase, "wizard");
  } catch (err) {
    if (err instanceof QuotaError) return { data: null, error: WIZARD_COPY.errors.quota };
    return failAction("generateTarget: quota", err, WIZARD_COPY.errors.generate);
  }

  const { system, user } = buildWizardPrompt({
    description: parsed.data.description,
    etiologyHint: parsed.data.etiologyHint,
    locale: LOCALE,
  });

  try {
    let proposal = await generateStructured({
      kind: "wizard",
      schema: wizardProposalSchema,
      system,
      user,
      effort: "medium",
      maxTokens: 4096,
    });

    let check = validateTarget(proposal);
    if (!check.ok) {
      // ONE corrective re-ask: hand the exact rule violations back for the model to fix.
      proposal = await generateStructured({
        kind: "wizard",
        schema: wizardProposalSchema,
        system,
        user: refineUserMessage(user, check.violations),
        effort: "medium",
        maxTokens: 4096,
      });
      check = validateTarget(proposal);
      if (!check.ok) return { data: null, error: WIZARD_COPY.errors.refine };
    }

    return {
      data: {
        ...proposal,
        acceptedVariants: normalizeVariants(proposal.answer, proposal.acceptedVariants),
      },
      error: null,
    };
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return { data: null, error: WIZARD_COPY.errors.generate };
    }
    return failAction("generateTarget: generate", err, WIZARD_COPY.errors.generate);
  }
}

/**
 * Persist an accepted proposal OR a hand-entered target. Separate from generation on purpose: a
 * proposal is only saved on an explicit tap, and the hand-entry form reaches this directly (Claude
 * failure never blocks target creation). Inserts via the RLS user client under the caregiver's
 * patient. New targets are draft/unscreened — a candidacy screen precedes first practice — EXCEPT
 * in DEMO_MODE, where they go straight to passed/active so the demo can practise immediately.
 */
export async function createTargetAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createTargetInputSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: zerr(parsed.error.issues) };

  const { user, supabase } = await requireUser();

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientErr) return failAction("createTarget: patient", patientErr, WIZARD_COPY.errors.save);
  if (!patient) return { data: null, error: WIZARD_COPY.errors.noPatient };

  // A caregiver may only attach their OWN uploaded object: keep the path only if its folder is the
  // caller's uid and the shape is valid, else drop it silently (never block target creation on it).
  const photoPath =
    parsed.data.photoPath && isOwnedPhotoPath(parsed.data.photoPath, user.id)
      ? parsed.data.photoPath
      : null;

  const demo = process.env.DEMO_MODE === "1";
  const { data, error } = await supabase
    .from("targets")
    .insert({
      patient_id: patient.id,
      question: parsed.data.question,
      answer: parsed.data.answer,
      accepted_variants: parsed.data.acceptedVariants as unknown as Json,
      answer_format: parsed.data.answerFormat,
      photo_path: photoPath,
      // Demo skips the (post-MVP) candidacy-screening UI so the new target is practisable at once.
      candidacy: demo ? "passed" : "unscreened",
      status: demo ? "active" : "draft",
    })
    .select("id")
    .single();
  if (error || !data) return failAction("createTarget: insert", error, WIZARD_COPY.errors.save);

  return { data: { id: data.id }, error: null };
}

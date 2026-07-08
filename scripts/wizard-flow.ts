// Shared wizard-generation flow for the Phase-4 Task 7 dev scripts (eval-wizard.ts,
// record-fixtures.ts). Mirrors apps/web/src/lib/wizard/actions.ts's `generateTargetAction`
// composition EXACTLY (buildWizardPrompt -> generateStructured -> validateTarget -> ONE
// corrective re-ask on violation -> final validateTarget) but bypasses auth/quota: these are dev
// scripts using the key from env, not a user path (PLAN.md Task 7).
import { buildWizardPrompt, refineUserMessage } from "@keepsake/core/prompts/wizard";
import { generateStructured } from "@/lib/ai/core";
import { validateTarget } from "@/lib/wizard/rules";
import { type WizardProposal, wizardProposalSchema } from "@/lib/wizard/schema";

const LOCALE = "en";

export interface WizardFlowResult {
  proposal: WizardProposal;
  /** Violations on the first draft; [] if the first draft already passed. */
  firstViolations: string[];
  reAsked: boolean;
  /** Violations remaining after the (possible) re-ask; [] means the final proposal passes. */
  finalViolations: string[];
}

export async function runWizardFlow(
  description: string,
  etiologyHint?: string,
): Promise<WizardFlowResult> {
  const { system, user } = buildWizardPrompt({
    description,
    locale: LOCALE,
    ...(etiologyHint ? { etiologyHint } : {}),
  });

  let proposal = await generateStructured({
    kind: "wizard",
    schema: wizardProposalSchema,
    system,
    user,
    effort: "medium",
    maxTokens: 4096,
  });

  let check = validateTarget(proposal);
  const firstViolations = check.ok ? [] : check.violations;
  let reAsked = false;

  if (!check.ok) {
    reAsked = true;
    proposal = await generateStructured({
      kind: "wizard",
      schema: wizardProposalSchema,
      system,
      user: refineUserMessage(user, check.violations),
      effort: "medium",
      maxTokens: 4096,
    });
    check = validateTarget(proposal);
  }

  return { proposal, firstViolations, reAsked, finalViolations: check.ok ? [] : check.violations };
}

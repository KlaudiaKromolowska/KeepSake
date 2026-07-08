"use client";

import { WIZARD_COPY } from "@/lib/wizard/copy";
import type { WizardProposal } from "@/lib/wizard/schema";

const C = WIZARD_COPY;

/**
 * The generated target, shown for review before anything is saved. Renders the question/answer, the
 * REQUIRED self-critique ("first draft → set aside because") in deliberately quiet styling, and any
 * red-flag advisories in calm amber. Accept persists; Try again re-runs generation.
 */
export function ProposalCard({
  proposal,
  onAccept,
  onTryAgain,
  saving,
  busy,
}: {
  proposal: WizardProposal;
  onAccept: () => void;
  onTryAgain: () => void;
  saving: boolean;
  busy: boolean;
}) {
  return (
    <section className="flex w-full max-w-2xl flex-col gap-5 rounded-2xl border-2 border-zinc-300 bg-white p-6 text-zinc-900">
      <h2 className="text-xl font-semibold">{C.proposal.heading}</h2>

      <Field label={C.proposal.questionLabel}>
        <p className="text-2xl font-medium leading-snug">{proposal.question}</p>
      </Field>

      <Field label={C.proposal.answerLabel}>
        <p className="text-2xl font-semibold">{proposal.answer}</p>
      </Field>

      {proposal.acceptedVariants.length > 0 && (
        <Field label={C.proposal.variantsLabel}>
          <p className="text-lg text-zinc-700">{proposal.acceptedVariants.join(", ")}</p>
        </Field>
      )}

      <Field label={C.proposal.rationaleLabel}>
        <p className="text-lg text-zinc-700">{proposal.rationale}</p>
      </Field>

      <SelfCritique proposal={proposal} />

      {proposal.redFlags.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border-l-4 border-amber-600 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-base font-medium text-amber-900">
            <NoticeIcon />
            {C.redFlags.heading}
          </p>
          <ul className="list-disc pl-8 text-base text-amber-900">
            {proposal.redFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-base text-zinc-500">{C.candidacy.note}</p>

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="min-h-[52px] rounded-xl border-2 border-zinc-900 bg-zinc-900 px-6 text-lg font-medium text-white focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
        >
          {saving ? C.proposal.saving : C.proposal.accept}
        </button>
        <button
          type="button"
          onClick={onTryAgain}
          disabled={busy}
          className="min-h-[52px] rounded-xl border-2 border-zinc-400 bg-white px-6 text-lg font-medium text-zinc-900 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:opacity-50"
        >
          {C.proposal.tryAgain}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-base font-medium uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

/** The visible self-critique — quiet, secondary styling so it reads as a footnote, not a warning. */
function SelfCritique({ proposal }: { proposal: WizardProposal }) {
  const { rejectedDraft, reason } = proposal.selfCritique;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-zinc-600">
      <p className="text-base font-medium uppercase tracking-wide text-zinc-500">
        {WIZARD_COPY.critique.heading}
      </p>
      <p className="text-base">
        <span className="text-zinc-500">{WIZARD_COPY.critique.firstDraft}: </span>
        <span className="italic">
          “{rejectedDraft.question}” → {rejectedDraft.answer}
        </span>
      </p>
      <p className="text-base">
        <span className="text-zinc-500">{WIZARD_COPY.critique.rejectedBecause}: </span>
        {reason}
      </p>
    </div>
  );
}

function NoticeIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative, aria-hidden, paired with a visible label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8.25v4.5m0 3h.008M10.29 3.86 1.82 18a1.5 1.5 0 001.29 2.25h17.78A1.5 1.5 0 0022.18 18L13.71 3.86a1.5 1.5 0 00-2.42 0z"
      />
    </svg>
  );
}

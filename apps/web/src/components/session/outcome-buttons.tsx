import type { Outcome } from "@keepsake/core/sr";
import { SESSION_COPY } from "@/lib/session/copy";

const BUTTON_BASE =
  "flex min-h-[64px] items-center justify-center gap-3 rounded-2xl border-2 px-8 text-2xl font-medium focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-zinc-900";

// Speech-assist emphasis: a soft ring on the suggested outcome. Suggestion only — the caregiver
// always taps; all three buttons stay equally available.
const SUGGESTED_RING: Record<Outcome, string> = {
  recall: "ring-4 ring-emerald-600 ring-offset-2",
  miss: "ring-4 ring-zinc-500 ring-offset-2",
  unclear: "ring-4 ring-amber-600 ring-offset-2",
};

export function OutcomeButtons({
  onOutcome,
  suggested = null,
}: {
  onOutcome: (outcome: Outcome) => void;
  suggested?: Outcome | null;
}) {
  const ring = (o: Outcome) => (suggested === o ? ` ${SUGGESTED_RING[o]}` : "");
  return (
    <div className="flex flex-wrap justify-center gap-6">
      <button
        type="button"
        onClick={() => onOutcome("recall")}
        className={`${BUTTON_BASE} border-emerald-700 bg-emerald-50 text-emerald-900${ring("recall")}`}
      >
        <CheckIcon />
        {SESSION_COPY.outcomes.recall}
      </button>
      <button
        type="button"
        onClick={() => onOutcome("miss")}
        className={`${BUTTON_BASE} border-zinc-500 bg-zinc-50 text-zinc-900${ring("miss")}`}
      >
        <ArrowPathIcon />
        {SESSION_COPY.outcomes.miss}
      </button>
      <button
        type="button"
        onClick={() => onOutcome("unclear")}
        className={`${BUTTON_BASE} border-amber-700 bg-amber-50 text-amber-900${ring("unclear")}`}
      >
        <QuestionIcon />
        {SESSION_COPY.outcomes.unclear}
      </button>
    </div>
  );
}

function CheckIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ArrowPathIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 4.5a8 8 0 10.001 15.999M16.5 4.5v5h-5M16.5 4.5H21"
      />
    </svg>
  );
}

function QuestionIcon() {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative icon, aria-hidden and paired with a visible text label
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-8 w-8"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.5 9a2.5 2.5 0 115 0c0 1.5-2.5 2-2.5 3.5"
      />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

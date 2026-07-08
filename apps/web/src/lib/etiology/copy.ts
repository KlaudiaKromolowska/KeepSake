/** EN copy for the etiology extended-thinking surface. Wellness-safe: no fail/wrong/miss language. */
export const ETIOLOGY_COPY = {
  title: "Claude's clinical reasoning",
  intro:
    "See how Claude reasons about the best way to practise, given the memory condition on file. The recommended practice format is always set by Keepsake's clinical rules — this is a window into the thinking, not a change to the plan.",
  start: "Show the reasoning",
  streaming: "Claude is thinking through this…",
  reasoningLabel: "Reasoning in progress",
  reasoningHeading: "Claude's reasoning",
  recommendationHeading: "Recommendation",
  formatLabel: "Practice format",
  format: {
    free_recall: "Free recall — the person brings the answer to mind on their own",
    recognition: "Recognition — the person picks the answer from a few options",
  },
  responseWindowLabel: "How long to wait",
  cueModalityLabel: "Helpful cue",
  whyLabel: "Why",
  deterministicNote: "This is Keepsake's clinical default for this condition.",
  contradictedNote:
    "Claude leaned toward a different format here, but Keepsake keeps the clinical default above — the deterministic rule is the source of truth.",
  modelUnavailableNote:
    "Claude's note isn't available right now, so this shows Keepsake's clinical default for the condition.",
  errors: {
    generic: "The reasoning isn't available right now.",
    signedOut: "Please sign in again to see the reasoning.",
    quota: "The hourly limit for AI help has been reached. Please try again later.",
    noData: "Add a patient first to see etiology-based reasoning.",
  },
  retry: "Try again",
  disclaimer:
    "For your understanding only, not medical advice. Practice format and scheduling are set by Keepsake.",
} as const;

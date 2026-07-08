// Every user-facing string for the Research view (/review). Caregiver/researcher-facing, English
// for the hackathon demo. Wellness-safe wording: no disease naming, no "wrong"/"fail". SESSION_COPY
// style — a single frozen const so copy lives in one reviewable place.

export const REVIEW_COPY = {
  title: "Research view",
  intro:
    "Ask a question about this person's real practice logs. Claude reads every trial and writes a short single-subject report.",
  suggestedQuestion: "What is the acquisition rate, and is retention decaying between sessions?",
  questionLabel: "Your question",
  questionPlaceholder: "Ask about acquisition, recovery after a miss, the interval reached…",
  analyze: "Analyze",
  analyzing: "Claude is running its analyses…",
  reportLabel: "Study report",
  trailLabel: "How this report was produced",
  trailIntro:
    "Claude chose and ran these analyses over the trial logs, then wrote the report from what they returned:",
  copy: "Copy report",
  copied: "Copied",
  copyFailed: "Couldn't copy — select the text to copy it manually.",
  reportPlaceholder: "Your report will appear here.",
  errors: {
    tooShort: "Please write a slightly longer question (at least 5 characters).",
    generic: "The report isn't available right now. Please try again.",
    signedOut: "Please sign in again to run a report.",
    quota: "The limit for AI help has been reached for now. Please try again later.",
    noData: "There's no practice data to analyze yet.",
  },
  retry: "Try again",
  disclaimer:
    "A single person's log tunes their own practice — it isn't a clinical study and settles no general question.",
} as const;

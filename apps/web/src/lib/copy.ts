// App-wide user-facing strings shared across pages (page-specific copy lives in lib/*/copy.ts).
// Wellness-safe wording only: no disease naming, no clinical claims or verbs (PLAN.md §10).
// PLAN.md specifies no exact footer wording — these lines were written to its §10 rules:
// "not a medical device", no condition named, calm crisis pointer to a doctor/emergency services.

export const FOOTER_COPY = {
  notMedical:
    "Keepsake is a wellness companion for practising everyday memories together — not a medical device. It doesn't diagnose, treat, or prevent any condition.",
  crisis:
    "If you're worried about sudden changes or someone's safety, please contact a doctor or your local emergency services.",
} as const;

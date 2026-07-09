// Every user-facing string for the Trends view (/trends). PLAN.md §3.5 + §10: a self-referenced
// learning-dynamics signal only — "compared to this person's own earlier sessions," never a
// diagnosis, never a cross-person comparison, no clinical thresholds, no disease naming. Wording
// mirrors PROGRESS_COPY's wellness-safe conventions (no "wrong"/"fail"/"decline").

export const TRENDS_COPY = {
  title: "Learning-dynamics trends",
  cardHint: "See how practice has changed over time — for this person, against their own history.",
  intro:
    "Everything below is compared only to this person's own earlier sessions — never to anyone else, and never used to detect or diagnose anything.",
  disclaimer:
    "This page shows patterns in this person's own practice data over time. It is not a diagnosis and does not detect, measure, or track any medical condition. If something here worries you, discuss it with a doctor.",
  unavailable: "Trends aren't available right now. Please try again.",
  noTarget: "Create a memory target to start building trend data.",
  backToHome: "Back to home",
  exportCsv: "Download practice data (CSV)",
  retention: {
    heading: "Item retention, per target",
    hint: "The longest delay recalled each session, target by target.",
    empty: "No practice sessions yet for this target.",
  },
  band: {
    heading: "Ladder progress, all targets",
    hint: "How far each target has climbed its own practice ladder so far — the ladder step reached most recently, not compared across targets or people.",
    empty: "No practice sessions yet — ladder progress will appear here once practice begins.",
    emptyTarget: "No practice sessions yet.",
    table: {
      toggle: "View as a table",
      target: "Target",
      band: "Furthest step reached",
    },
  },
  affect: {
    heading: "Mood around practice",
    hint: "The two-tap comfort check-in before and after each session — a comfort signal, not a mood diagnosis.",
    legend: "Filled marker = logged as calm. Open marker = logged as unsettled. Gap = skipped.",
    empty: "No mood check-ins recorded yet.",
    table: {
      toggle: "View as a table",
      session: "Session",
      pre: "Before practice",
      post: "After practice",
      content: "Calm",
      unsettled: "Unsettled",
      skipped: "Skipped",
    },
    summary: (
      n: number,
      preContent: number,
      preUnsettled: number,
      postContent: number,
      postUnsettled: number,
    ) =>
      `Across ${n} check-in${n === 1 ? "" : "s"}: before practice, calm ${preContent} time${preContent === 1 ? "" : "s"} and unsettled ${preUnsettled} time${preUnsettled === 1 ? "" : "s"}; after practice, calm ${postContent} time${postContent === 1 ? "" : "s"} and unsettled ${postUnsettled} time${postUnsettled === 1 ? "" : "s"}.`,
  },
} as const;

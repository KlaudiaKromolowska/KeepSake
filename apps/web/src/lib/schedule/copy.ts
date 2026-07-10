// Every user-facing string for the dashboard due-status line. Wellness-safe, adherence-first
// wording (PLAN.md §6): an invitation, never a debt — no "missed", "late", "behind", or streaks.
// Overdue deliberately reads as a gentle welcome-back, and a growing gap is framed as the goal.

export const SCHEDULE_COPY = {
  acquisition: "Practising most days helps this memory settle in.",
  overdue: "Whenever you're ready — today is a good day.",
  practice: "This memory is settling in — practise together whenever it suits you.",
  maintenance: "This memory is holding well — a gentle moment together whenever it suits you.",
} as const;

// Every user-facing string for the schedule/plan page (/schedule). Same wellness-safe voice as
// above: keeping a memory comfortable, never testing — no "fail", "miss", "wrong", or "behind".
export const SCHEDULE_PLAN_COPY = {
  title: "The plan",
  intro: "How Keepsake keeps this memory feeling comfortable over time.",
  cardHint: "See the plan for keeping this memory comfortable.",
  noTarget: "Create a memory to see its plan.",
  unavailable: "The plan isn't available right now. Please try again.",
  backToHome: "Back to home",

  journeyHeading: "Where this memory is on its journey",
  journey: {
    acquiring: {
      title: "Getting to know it",
      note: "Practising together so the memory settles in.",
    },
    mastered: {
      title: "Comfortably settled",
      note: "Recalled at the start of three sessions on different days.",
    },
    maintenance: {
      title: "Keeping it comfortable",
      note: "Gentle check-ins, spread further and further apart.",
    },
  },
  stageStatus: { done: "Reached", current: "You are here", upcoming: "Ahead" },

  windowHeading: "Practising together",
  window:
    "Practise together whenever it suits you — the timing stays gentle, so there's never a date to chase.",

  masteryHeading: "Settling in",
  mastery: {
    settling:
      "This memory is still settling in — recalled at the start of some recent sessions on different days.",
    settled: "Comfortably settled — recalled at the start of three sessions on different days.",
  },

  boosterHeading: "The rhythm ahead",
  booster:
    "Once a memory is settled, practising together naturally spreads further and further apart — each time a little longer than the last — so it stays comfortable with the lightest touch.",
  boosterHint:
    "If a check-in ever needs a little more practice, the rhythm simply eases back a step — always gentle.",
} as const;

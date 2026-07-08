// Every user-facing string for the dashboard due-status line. Wellness-safe, adherence-first
// wording (PLAN.md §6): an invitation, never a debt — no "missed", "late", "behind", or streaks.
// Overdue deliberately reads as a gentle welcome-back, and a growing gap is framed as the goal.

export const SCHEDULE_COPY = {
  acquisition: "Practising most days helps this memory settle in.",
  overdue: "Whenever you're ready — today is a good day.",
  practice: {
    dueToday: "Practice is due today.",
    dueTomorrow: "The next practice is suggested tomorrow.",
    dueInDays: (days: number) =>
      `The next practice is suggested in ${days} days — the gap is growing, which is the goal.`,
  },
  maintenance: {
    dueToday: "A gentle check-in is due today.",
    dueTomorrow: "The next check-in is suggested tomorrow.",
    dueInDays: (days: number) =>
      `The next check-in is in ${days} days — this memory is holding well.`,
  },
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

  windowHeading: "Next practice",
  window: {
    unscheduled: "Practising most days for now — a longer rhythm will appear here soon.",
    overdue: "Whenever you're ready — today is a good day.",
    today: "Suggested today.",
    tomorrow: "Suggested tomorrow.",
    weekday: (label: string) => `Suggested on ${label}.`,
    inDays: (days: number) => `Suggested in ${days} days.`,
  },

  masteryHeading: "Settling-in progress",
  mastery: {
    count: (done: number, total: number) =>
      `${done} of ${total} calm start-of-session refreshers, on different days.`,
    none: "Just getting started — the first calm refreshers are on their way.",
    hint: "Three on different days means this memory is comfortably settled.",
    settled: "Comfortably settled — now on the gentle check-in rhythm below.",
  },

  boosterHeading: "The check-in rhythm ahead",
  boosterIntro:
    "Once settled, check-ins spread out — each one a little further apart, keeping the memory comfortable.",
  boosterCurrent: "Now",
  boosterHint:
    "If a check-in ever needs a little more practice, the rhythm simply eases back a step — always gentle.",
} as const;

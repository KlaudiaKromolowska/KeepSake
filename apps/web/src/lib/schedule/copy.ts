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

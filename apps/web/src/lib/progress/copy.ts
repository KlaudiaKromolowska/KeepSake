// Every user-facing string for the Progress view (/progress). Caregiver-facing, wellness-safe
// wording: no disease naming, no "wrong"/"fail"/"miss" — a start-probe miss is "began with a
// quick reminder". SESSION_COPY style — one frozen const so copy lives in one reviewable place.

export const PROGRESS_COPY = {
  title: "Practice progress",
  cardHint: "See how the recall delay is growing, session by session.",
  chartHeading: "Longest delay recalled, per session",
  chartHint:
    "Each dot is one practice session. Higher means the answer was held across a longer delay.",
  goalLabel: "goal",
  reminderKey: "An open circle marks a session that began with a quick reminder.",
  empty: "No practice sessions yet — progress will appear here after the first one.",
  noTarget: "Create a memory target to start practising.",
  unavailable: "Progress isn't available right now. Please try again.",
  backToHome: "Back to home",
  table: {
    toggle: "View as a table",
    session: "Session",
    delay: "Longest delay recalled",
    note: "Notes",
    reminderNote: "Began with a quick reminder",
    noNote: "—",
  },
  summary: {
    single: (day: string, best: string) =>
      `In the first practice session (${day}), the longest delay recalled was ${best}.`,
    grew: (n: number, firstDay: string, lastDay: string, from: string, to: string) =>
      `Across ${n} practice sessions (${firstDay} – ${lastDay}), the longest delay recalled grew from ${from} to ${to}.`,
    held: (n: number, firstDay: string, lastDay: string, at: string) =>
      `Across ${n} practice sessions (${firstDay} – ${lastDay}), the longest delay recalled has held steady at ${at}.`,
    moved: (n: number, firstDay: string, lastDay: string, from: string, to: string) =>
      `Across ${n} practice sessions (${firstDay} – ${lastDay}), the longest delay recalled went from ${from} to ${to}.`,
    rebuilding: (best: string) =>
      `The best delay so far is ${best} — dips are a normal part of spaced practice, and the next session rebuilds from a comfortable step.`,
    reminders: (k: number) =>
      `${k} ${k === 1 ? "session" : "sessions"} began with a quick reminder — a normal part of spaced practice.`,
    goalReached: (goal: string) =>
      `The in-session goal of ${goal} has been reached — check-ins now spread out across days.`,
  },
} as const;

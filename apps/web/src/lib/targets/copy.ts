import type { QueueSummary, TargetPhase } from "./queue";

// Caregiver-facing strings for the multi-target list/queue surface. Same wellness-safe, adherence-
// first voice as the schedule copy (PLAN §6): an invitation, never a debt — no "missed", "late",
// "behind", "test", or streaks. A queue is framed as "one at a time, gently", never a backlog.

export const TARGETS_COPY = {
  title: "Memories",
  intro: "Keepsake settles one memory at a time — the rest wait gently until it's ready.",
  cardHint: "See every memory and where each one is.",
  backToHome: "Back to home",
  empty: "No memories yet. Create the first one to begin.",
  unavailable: "The list isn't available right now. Please try again.",
  addAnother: "Add another memory",

  /** The badge shown on each target row. */
  phase: {
    acquiring: { label: "Practising now", note: "The memory you're settling in together." },
    queued: { label: "Waiting its turn", note: "Begins once the current memory is settled." },
    maintenance: { label: "Comfortably settled", note: "Holding well on gentle check-ins." },
    due: { label: "Check-in ready", note: "A gentle check-in is welcome today." },
  } satisfies Record<TargetPhase, { label: string; note: string }>,

  /** One-line dashboard summary of what's waiting today, derived from the queue counts. */
  summaryLine(s: QueueSummary): string {
    if (s.total === 0) return "";
    const parts: string[] = [];
    if (s.dueNow === 1) parts.push("1 memory in practice");
    else if (s.dueNow > 1) parts.push(`${s.dueNow} memories in practice`);
    if (s.queued === 1) parts.push("1 waiting its turn");
    else if (s.queued > 1) parts.push(`${s.queued} waiting their turn`);
    return parts.join(" · ");
  },
} as const;

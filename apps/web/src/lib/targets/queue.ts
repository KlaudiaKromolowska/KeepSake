import { type DueStatus, dueStatus } from "@/lib/schedule/due-status";

/**
 * V2 multi-target queueing — N independent state machines per patient, resolved app-side.
 *
 * The evidence rule is sequential-to-mastery (PLAN §1): exactly ONE target is in acquisition at a
 * time and newly created targets queue behind it. Mastered targets run their booster/maintenance
 * loops in parallel. None of this needs a new column — the acquisition slot is DERIVED: among the
 * still-acquiring (status "active", not mastered) targets, the earliest-created one holds the slot
 * and everything newer is queued. When it masters (status → "mastered") the next-oldest active
 * target inherits the slot automatically. Pure functions with an injected clock + patient timezone
 * so day-boundaries resolve patient-local, never UTC/server-local (mirrors schedule/due-status.ts).
 */

/**
 * The practicable target statuses — a target the caregiver can practise now or on a schedule.
 * "mastered" and "maintenance" both mean the post-mastery booster loop (only "mastered" is written
 * today; "maintenance" is accepted for forward-compatibility). "draft"/"paused"/"retired" are not
 * practicable and are excluded from the queue.
 */
export const PRACTICABLE_STATUSES = ["active", "mastered", "maintenance"] as const;

/** Minimal per-target shape the queue logic needs — DB rows mapped at the page boundary. */
export interface QueueTarget {
  id: string;
  question: string;
  status: string;
  /** ISO instant — the acquisition-order tiebreak (earliest holds the acquisition slot). */
  createdAt: string;
  scheduleMode: string | null;
  nextDueAt: string | null;
  masteredAt: string | null;
}

export type TargetPhase =
  | "acquiring" // the one target currently in acquisition
  | "queued" // active but behind the acquisition slot — waits its turn
  | "maintenance" // mastered, in the booster loop, not currently due
  | "due"; // mastered/booster target whose check-in has arrived (or is overdue)

export interface ClassifiedTarget {
  target: QueueTarget;
  phase: TargetPhase;
  due: DueStatus;
  isAcquisition: boolean;
}

/** Mastered targets carry a post-mastery status or a mastered_at timestamp (either is sufficient). */
function isMastered(t: QueueTarget): boolean {
  return t.status === "mastered" || t.status === "maintenance" || t.masteredAt !== null;
}

/**
 * The single target currently in acquisition: the earliest-created target still acquiring
 * (status "active", not yet mastered). Everything newer queues behind it. `null` when no target is
 * acquiring (all mastered, or none practicable).
 */
export function acquisitionTargetId(targets: readonly QueueTarget[]): string | null {
  const acquiring = targets
    .filter((t) => t.status === "active" && !isMastered(t))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return acquiring[0]?.id ?? null;
}

/** "now" = practise today (or overdue); "later" = a future scheduled day. */
function dueUrgency(kind: DueStatus["kind"]): "now" | "later" {
  return kind === "acquisition" || kind === "overdue" || kind === "dueToday" ? "now" : "later";
}

/** Classify every practicable target into exactly one caregiver-facing phase + its due-status. */
export function classifyTargets(
  targets: readonly QueueTarget[],
  nowMs: number,
  timeZone: string,
): ClassifiedTarget[] {
  const acqId = acquisitionTargetId(targets);
  return targets.map((t) => {
    const due = dueStatus(t.nextDueAt, t.scheduleMode, nowMs, timeZone);
    const isAcquisition = t.id === acqId;
    let phase: TargetPhase;
    if (isAcquisition) phase = "acquiring";
    else if (t.status === "active") phase = "queued";
    else phase = dueUrgency(due.kind) === "now" ? "due" : "maintenance";
    return { target: t, phase, due, isAcquisition };
  });
}

/**
 * Which target session entry should offer next. The acquisition target wins ties (sequential-to-
 * mastery focus); otherwise the most-overdue booster is offered. When nothing is strictly due the
 * acquisition target is still offered (practising most days is always welcome), falling back to the
 * booster due soonest. `null` only when there is no practicable target at all.
 *
 * Priority groups (lower first), then soonest-due, then oldest-created:
 *   0 acquisition target, due now      2 acquisition target, not yet due (still always offerable)
 *   1 booster target, due now          3 booster target, not yet due
 */
export function selectSessionTarget(
  targets: readonly QueueTarget[],
  nowMs: number,
  timeZone: string,
): string | null {
  const classified = classifyTargets(targets, nowMs, timeZone);
  if (classified.length === 0) return null;

  const dueMs = (c: ClassifiedTarget) =>
    c.target.nextDueAt ? Date.parse(c.target.nextDueAt) : Number.POSITIVE_INFINITY;
  const priority = (c: ClassifiedTarget) => {
    const now = dueUrgency(c.due.kind) === "now";
    if (c.isAcquisition) return now ? 0 : 2;
    return now ? 1 : 3;
  };

  const [best] = [...classified].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pa - pb;
    const da = dueMs(a);
    const db = dueMs(b);
    if (da !== db) return da - db;
    return a.target.createdAt.localeCompare(b.target.createdAt);
  });
  return best.target.id;
}

export interface QueueSummary {
  total: number;
  acquiring: number; // 0 or 1 — the acquisition slot
  queued: number;
  maintenance: number; // settled, not currently due
  dueNow: number; // targets to practise today (acquisition-due + due boosters)
}

/** Aggregate counts for the dashboard's one-line "what's waiting today" summary. */
export function summarizeQueue(classified: readonly ClassifiedTarget[]): QueueSummary {
  return {
    total: classified.length,
    acquiring: classified.filter((c) => c.phase === "acquiring").length,
    queued: classified.filter((c) => c.phase === "queued").length,
    maintenance: classified.filter((c) => c.phase === "maintenance").length,
    // Offerable today only: the acquisition target when due, plus due boosters. A queued target
    // can't be practised today (the acquisition slot is taken), so it never counts here.
    dueNow: classified.filter(
      (c) => c.phase === "due" || (c.phase === "acquiring" && dueUrgency(c.due.kind) === "now"),
    ).length,
  };
}

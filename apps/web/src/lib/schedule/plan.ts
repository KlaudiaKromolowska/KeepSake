import { calendarDayInTz, type SrConfig } from "@keepsake/core/sr";

/**
 * The caregiver-facing schedule "plan", derived entirely from persisted target_state + config —
 * nothing new is stored (mirrors due-status.ts). Pure functions with an injected `now` + timezone
 * so day-boundaries are computed in the PATIENT's timezone, never UTC/server-local.
 *
 * Journey: schedule_mode/mastered_at → where the target sits on acquiring → mastered → maintenance.
 * Next window: next_due_at → the patient-local day of the next practice. Booster ladder + mastery
 * progress: booster_step / start_streak read straight off the row against the engine config.
 */

const DAY_MS = 86_400_000;

export type JourneyKey = "acquiring" | "mastered" | "maintenance";
export type StepStatus = "done" | "current" | "upcoming";
export interface JourneyStep {
  key: JourneyKey;
  status: StepStatus;
}

/**
 * The 3-stage journey. Once mastered the target is in maintenance, so both earlier milestones read
 * as reached; before that only the first stage is current. (There is no runtime "mastered but not
 * yet in maintenance" state — mastery hands straight to the booster loop.)
 */
export function journeySteps(mastered: boolean): JourneyStep[] {
  const order: JourneyKey[] = ["acquiring", "mastered", "maintenance"];
  return order.map((key) => {
    if (mastered) return { key, status: key === "maintenance" ? "current" : "done" };
    return { key, status: key === "acquiring" ? "current" : "upcoming" };
  });
}

export type NextWindow =
  | { kind: "unscheduled" }
  | { kind: "overdue" }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "weekday"; label: string }
  | { kind: "inDays"; days: number };

function weekdayInTz(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(new Date(epochMs));
}

/**
 * Patient-local day of the next practice. Day-diff uses calendarDayInTz on both instants (same
 * technique as dueStatus): each "YYYY-MM-DD" parses as a UTC midnight, so the difference is an exact
 * whole number of days and an early-morning due time never reads as "overdue" that same evening.
 * A named weekday is friendlier than "in 4 days" but only within the coming week (7+ days out the
 * name would be ambiguous), so ≤ 6 days uses the weekday, beyond that a day count.
 */
export function nextPracticeWindow(
  nextDueAt: string | null,
  scheduleMode: string | null,
  nowMs: number,
  timeZone: string,
): NextWindow {
  if (scheduleMode !== "between" && scheduleMode !== "booster") return { kind: "unscheduled" };
  const dueMs = nextDueAt ? Date.parse(nextDueAt) : Number.NaN;
  if (Number.isNaN(dueMs)) return { kind: "unscheduled" };

  const days =
    (Date.parse(calendarDayInTz(dueMs, timeZone)) - Date.parse(calendarDayInTz(nowMs, timeZone))) /
    DAY_MS;

  if (days < 0) return { kind: "overdue" };
  if (days === 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  if (days <= 6) return { kind: "weekday", label: weekdayInTz(dueMs, timeZone) };
  return { kind: "inDays", days };
}

export interface BoosterStep {
  label: string;
  current: boolean;
}

/** Human cadence label for a booster gap in days: 90 → "3 months", 14 → "2 weeks", 5 → "5 days". */
function cadenceLabel(days: number): string {
  if (days % 30 === 0) return plural(days / 30, "month");
  if (days % 7 === 0) return plural(days / 7, "week");
  return plural(days, "day");
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/**
 * The booster ladder (config cadence, e.g. 1 week → 2 weeks → 1 month → 3 months). `boosterStep` is
 * null until the target enters the booster loop, so pre-mastery the ladder is shown with no current
 * step — a preview of the rhythm ahead.
 */
export function boosterLadder(
  boosterStep: number | null,
  cadenceDays: readonly number[],
): BoosterStep[] {
  return cadenceDays.map((days, i) => ({
    label: cadenceLabel(days),
    current: boosterStep !== null && i === boosterStep,
  }));
}

/** Mastery progress toward the streak goal, or null once mastered (nothing left to count). */
export function masteryProgress(
  startStreak: number,
  masteryStreak: number,
  mastered: boolean,
): { done: number; total: number } | null {
  if (mastered) return null;
  return { done: Math.min(Math.max(startStreak, 0), masteryStreak), total: masteryStreak };
}

export interface SchedulePlanInput {
  scheduleMode: string | null;
  nextDueAt: string | null;
  masteredAt: string | null;
  startStreak: number;
  boosterStep: number | null;
}

export interface SchedulePlan {
  mastered: boolean;
  steps: JourneyStep[];
  window: NextWindow;
  mastery: { done: number; total: number } | null;
  booster: BoosterStep[];
}

/** Compose the full plan the /schedule page renders. Everything derived; nothing persisted. */
export function schedulePlan(
  input: SchedulePlanInput,
  config: SrConfig,
  nowMs: number,
  timeZone: string,
): SchedulePlan {
  const mastered = input.masteredAt !== null;
  return {
    mastered,
    steps: journeySteps(mastered),
    window: nextPracticeWindow(input.nextDueAt, input.scheduleMode, nowMs, timeZone),
    mastery: masteryProgress(input.startStreak, config.masteryStreak, mastered),
    booster: boosterLadder(input.boosterStep, config.boosterCadenceDays),
  };
}

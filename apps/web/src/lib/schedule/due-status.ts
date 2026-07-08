import { calendarDayInTz } from "@keepsake/core/sr";
import { SCHEDULE_COPY } from "./copy";

/**
 * Due-status for the dashboard, derived from persisted target_state (schedule_mode +
 * next_due_at). `schedule_mode` is null until the within-session ceiling hands off to the
 * between-session scheduler (scheduler.ts), so null → "acquisition" (daily practice suits this
 * stage). "booster" mode = post-mastery maintenance.
 *
 * Day-level precision is deliberate (mirrors the scheduler): due-ness compares calendar days in
 * the patient's timezone, so 23:59 vs 00:01 across the tz's midnight lands on different days and
 * an early-morning due time never reads as "overdue" that same evening.
 */
export type DueStatus =
  | { kind: "acquisition" }
  | { kind: "overdue"; maintenance: boolean }
  | { kind: "dueToday"; maintenance: boolean }
  | { kind: "dueTomorrow"; maintenance: boolean }
  | { kind: "dueInDays"; days: number; maintenance: boolean };

const DAY_MS = 86_400_000;

export function dueStatus(
  nextDueAt: string | null,
  scheduleMode: string | null,
  nowMs: number,
  timeZone: string,
): DueStatus {
  if (scheduleMode !== "between" && scheduleMode !== "booster") return { kind: "acquisition" };
  const dueMs = nextDueAt ? Date.parse(nextDueAt) : Number.NaN;
  if (Number.isNaN(dueMs)) return { kind: "acquisition" };

  // calendarDayInTz returns "YYYY-MM-DD", which parses as a UTC midnight — the difference of two
  // such midnights is an exact whole number of days.
  const days =
    (Date.parse(calendarDayInTz(dueMs, timeZone)) - Date.parse(calendarDayInTz(nowMs, timeZone))) /
    DAY_MS;
  const maintenance = scheduleMode === "booster";

  if (days < 0) return { kind: "overdue", maintenance };
  if (days === 0) return { kind: "dueToday", maintenance };
  if (days === 1) return { kind: "dueTomorrow", maintenance };
  return { kind: "dueInDays", days, maintenance };
}

/** The one caregiver-facing line the dashboard renders for a status. */
export function dueStatusLine(status: DueStatus): string {
  if (status.kind === "acquisition") return SCHEDULE_COPY.acquisition;
  if (status.kind === "overdue") return SCHEDULE_COPY.overdue;
  const copy = status.maintenance ? SCHEDULE_COPY.maintenance : SCHEDULE_COPY.practice;
  if (status.kind === "dueToday") return copy.dueToday;
  if (status.kind === "dueTomorrow") return copy.dueTomorrow;
  return copy.dueInDays(status.days);
}

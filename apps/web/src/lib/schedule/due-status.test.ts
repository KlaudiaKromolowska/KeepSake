import { describe, expect, it } from "vitest";
import { SCHEDULE_COPY } from "./copy";
import { type DueStatus, dueStatus, dueStatusLine } from "./due-status";

const TZ = "Europe/Warsaw"; // +02:00 in July 2026

// Noon UTC = 14:00 Warsaw on the given July-2026 day — safely mid-day in both zones.
const utc = (day: number, hour = 12, minute = 0) => Date.UTC(2026, 6, day, hour, minute, 0);
const iso = (day: number, hour = 12, minute = 0) => new Date(utc(day, hour, minute)).toISOString();

describe("dueStatus", () => {
  it("no schedule yet (schedule_mode null) → acquisition", () => {
    expect(dueStatus(null, null, utc(8), TZ)).toEqual({ kind: "acquisition" });
    expect(dueStatus(iso(9), null, utc(8), TZ)).toEqual({ kind: "acquisition" });
  });

  it("unknown mode or missing/invalid next_due_at → acquisition (fail-safe)", () => {
    expect(dueStatus(null, "between", utc(8), TZ)).toEqual({ kind: "acquisition" });
    expect(dueStatus("not-a-date", "between", utc(8), TZ)).toEqual({ kind: "acquisition" });
    expect(dueStatus(iso(9), "within", utc(8), TZ)).toEqual({ kind: "acquisition" });
  });

  it("due on an earlier calendar day → overdue", () => {
    expect(dueStatus(iso(6), "between", utc(8), TZ)).toEqual({
      kind: "overdue",
      maintenance: false,
    });
  });

  it("due earlier today is still dueToday, not overdue (day-level precision)", () => {
    expect(dueStatus(iso(8, 6), "between", utc(8, 18), TZ)).toEqual({
      kind: "dueToday",
      maintenance: false,
    });
  });

  it("due on the next calendar day → dueTomorrow", () => {
    expect(dueStatus(iso(9), "between", utc(8), TZ)).toEqual({
      kind: "dueTomorrow",
      maintenance: false,
    });
  });

  it("due N calendar days out → dueInDays with the day count", () => {
    expect(dueStatus(iso(11), "between", utc(8), TZ)).toEqual({
      kind: "dueInDays",
      days: 3,
      maintenance: false,
    });
  });

  it("booster mode flags maintenance", () => {
    expect(dueStatus(iso(8), "booster", utc(8), TZ)).toEqual({
      kind: "dueToday",
      maintenance: true,
    });
    expect(dueStatus(iso(22), "booster", utc(8), TZ)).toEqual({
      kind: "dueInDays",
      days: 14,
      maintenance: true,
    });
  });

  it("tz edge: due 22:30 UTC = 00:30 next day in Warsaw → dueTomorrow, not dueToday", () => {
    expect(dueStatus(iso(8, 22, 30), "between", utc(8, 12), TZ)).toEqual({
      kind: "dueTomorrow",
      maintenance: false,
    });
  });

  it("tz edge: now 23:30 UTC = 01:30 next day in Warsaw → a next-UTC-day due is dueToday", () => {
    // now: Jul 8 23:30 UTC = Jul 9 01:30 Warsaw; due: Jul 9 10:00 UTC = Jul 9 12:00 Warsaw.
    expect(dueStatus(iso(9, 10), "between", utc(8, 23, 30), TZ)).toEqual({
      kind: "dueToday",
      maintenance: false,
    });
  });
});

describe("dueStatusLine", () => {
  const line = (s: DueStatus) => dueStatusLine(s);

  it("maps every status to its date-free copy", () => {
    expect(line({ kind: "acquisition" })).toBe(SCHEDULE_COPY.acquisition);
    expect(line({ kind: "overdue", maintenance: false })).toBe(SCHEDULE_COPY.overdue);
    expect(line({ kind: "overdue", maintenance: true })).toBe(SCHEDULE_COPY.overdue);
    // Between-session (settling in) → the single practice line, regardless of the dated kind.
    expect(line({ kind: "dueToday", maintenance: false })).toBe(SCHEDULE_COPY.practice);
    expect(line({ kind: "dueTomorrow", maintenance: false })).toBe(SCHEDULE_COPY.practice);
    expect(line({ kind: "dueInDays", days: 3, maintenance: false })).toBe(SCHEDULE_COPY.practice);
    // Booster (holding well) → the single maintenance line, regardless of the dated kind.
    expect(line({ kind: "dueToday", maintenance: true })).toBe(SCHEDULE_COPY.maintenance);
    expect(line({ kind: "dueTomorrow", maintenance: true })).toBe(SCHEDULE_COPY.maintenance);
    expect(line({ kind: "dueInDays", days: 14, maintenance: true })).toBe(
      SCHEDULE_COPY.maintenance,
    );
  });

  // Monika's rule: the between-session scheduler stays engine-only — no dated prompt or counter is
  // ever surfaced. Guard every dashboard due-line against a leaked date/weekday/counter.
  it("never surfaces a date, weekday, or counter to the caregiver", () => {
    const statuses: DueStatus[] = [
      { kind: "acquisition" },
      { kind: "overdue", maintenance: false },
      { kind: "overdue", maintenance: true },
      { kind: "dueToday", maintenance: false },
      { kind: "dueTomorrow", maintenance: false },
      { kind: "dueInDays", days: 3, maintenance: false },
      { kind: "dueToday", maintenance: true },
      { kind: "dueTomorrow", maintenance: true },
      { kind: "dueInDays", days: 14, maintenance: true },
    ];
    const banned =
      /tomorrow|\bin \d+ days?\b|\d+ of \d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i;
    for (const s of statuses) expect(line(s)).not.toMatch(banned);
  });
});

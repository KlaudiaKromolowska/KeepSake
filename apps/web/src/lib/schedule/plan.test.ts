import { DEFAULT_SR_CONFIG } from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import {
  boosterLadder,
  journeySteps,
  masteryProgress,
  nextPracticeWindow,
  schedulePlan,
} from "./plan";

const TZ = "Europe/Warsaw"; // +02:00 in July 2026
const utc = (day: number, hour = 12, minute = 0) => Date.UTC(2026, 6, day, hour, minute, 0);
const iso = (day: number, hour = 12, minute = 0) => new Date(utc(day, hour, minute)).toISOString();

describe("journeySteps", () => {
  it("pre-mastery → only acquiring is current, the rest ahead", () => {
    expect(journeySteps(false)).toEqual([
      { key: "acquiring", status: "current" },
      { key: "mastered", status: "upcoming" },
      { key: "maintenance", status: "upcoming" },
    ]);
  });

  it("mastered → earlier stages reached, maintenance current", () => {
    expect(journeySteps(true)).toEqual([
      { key: "acquiring", status: "done" },
      { key: "mastered", status: "done" },
      { key: "maintenance", status: "current" },
    ]);
  });
});

describe("nextPracticeWindow", () => {
  it("no between/booster schedule yet → unscheduled", () => {
    expect(nextPracticeWindow(iso(9), null, utc(8), TZ)).toEqual({ kind: "unscheduled" });
    expect(nextPracticeWindow(iso(9), "within", utc(8), TZ)).toEqual({ kind: "unscheduled" });
  });

  it("missing/invalid next_due_at → unscheduled (fail-safe)", () => {
    expect(nextPracticeWindow(null, "between", utc(8), TZ)).toEqual({ kind: "unscheduled" });
    expect(nextPracticeWindow("nope", "between", utc(8), TZ)).toEqual({ kind: "unscheduled" });
  });

  it("earlier calendar day → overdue", () => {
    expect(nextPracticeWindow(iso(6), "between", utc(8), TZ)).toEqual({ kind: "overdue" });
  });

  it("today / tomorrow", () => {
    expect(nextPracticeWindow(iso(8, 6), "between", utc(8, 18), TZ)).toEqual({ kind: "today" });
    expect(nextPracticeWindow(iso(9), "between", utc(8), TZ)).toEqual({ kind: "tomorrow" });
  });

  it("2–6 days out → named weekday in the patient tz", () => {
    // Jul 8 2026 is a Wednesday; +3 days (Jul 11) is a Saturday.
    expect(nextPracticeWindow(iso(11), "between", utc(8), TZ)).toEqual({
      kind: "weekday",
      label: "Saturday",
    });
  });

  it("7+ days out → a day count, not an ambiguous weekday", () => {
    expect(nextPracticeWindow(iso(22), "booster", utc(8), TZ)).toEqual({
      kind: "inDays",
      days: 14,
    });
  });

  it("tz edge: due 22:30 UTC = 00:30 next day in Warsaw → tomorrow, not today", () => {
    expect(nextPracticeWindow(iso(8, 22, 30), "between", utc(8, 12), TZ)).toEqual({
      kind: "tomorrow",
    });
  });

  it("tz edge: now 23:30 UTC = 01:30 next day in Warsaw → a next-UTC-day due reads as today", () => {
    expect(nextPracticeWindow(iso(9, 10), "between", utc(8, 23, 30), TZ)).toEqual({
      kind: "today",
    });
  });

  it("weekday label is the DUE day's weekday in the patient tz, not UTC", () => {
    // Due Jul 11 23:30 UTC = Jul 12 01:30 Warsaw (Sunday); now Jul 8 → 4 patient-days out.
    expect(nextPracticeWindow(iso(11, 23, 30), "between", utc(8, 12), TZ)).toEqual({
      kind: "weekday",
      label: "Sunday",
    });
  });
});

describe("boosterLadder", () => {
  it("labels the default cadence and highlights the current step", () => {
    expect(boosterLadder(1, DEFAULT_SR_CONFIG.boosterCadenceDays)).toEqual([
      { label: "1 week", current: false },
      { label: "2 weeks", current: true },
      { label: "1 month", current: false },
      { label: "3 months", current: false },
    ]);
  });

  it("null step (pre-mastery) → ladder shown with no current step", () => {
    expect(boosterLadder(null, DEFAULT_SR_CONFIG.boosterCadenceDays).every((s) => !s.current)).toBe(
      true,
    );
  });
});

describe("masteryProgress", () => {
  it("counts the streak toward the goal, clamped", () => {
    expect(masteryProgress(2, 3, false)).toEqual({ done: 2, total: 3 });
    expect(masteryProgress(9, 3, false)).toEqual({ done: 3, total: 3 });
    expect(masteryProgress(-1, 3, false)).toEqual({ done: 0, total: 3 });
  });

  it("mastered → null (nothing left to count)", () => {
    expect(masteryProgress(3, 3, true)).toBeNull();
  });
});

describe("schedulePlan", () => {
  it("no persisted schedule yet → acquiring, unscheduled, 0-of-goal, ladder previewed", () => {
    const plan = schedulePlan(
      { scheduleMode: null, nextDueAt: null, masteredAt: null, startStreak: 0, boosterStep: null },
      DEFAULT_SR_CONFIG,
      utc(8),
      TZ,
    );
    expect(plan.mastered).toBe(false);
    expect(plan.steps[0]).toEqual({ key: "acquiring", status: "current" });
    expect(plan.window).toEqual({ kind: "unscheduled" });
    expect(plan.mastery).toEqual({ done: 0, total: 3 });
    expect(plan.booster.every((s) => !s.current)).toBe(true);
  });

  it("between mode, mid-streak → progress shown, next window derived", () => {
    const plan = schedulePlan(
      {
        scheduleMode: "between",
        nextDueAt: iso(9),
        masteredAt: null,
        startStreak: 2,
        boosterStep: null,
      },
      DEFAULT_SR_CONFIG,
      utc(8),
      TZ,
    );
    expect(plan.mastery).toEqual({ done: 2, total: 3 });
    expect(plan.window).toEqual({ kind: "tomorrow" });
  });

  it("mastered booster target → maintenance, no mastery count, current booster step", () => {
    const plan = schedulePlan(
      {
        scheduleMode: "booster",
        nextDueAt: iso(22),
        masteredAt: iso(1),
        startStreak: 3,
        boosterStep: 1,
      },
      DEFAULT_SR_CONFIG,
      utc(8),
      TZ,
    );
    expect(plan.mastered).toBe(true);
    expect(plan.steps.at(-1)).toEqual({ key: "maintenance", status: "current" });
    expect(plan.mastery).toBeNull();
    expect(plan.window).toEqual({ kind: "inDays", days: 14 });
    expect(plan.booster[1]).toEqual({ label: "2 weeks", current: true });
  });
});

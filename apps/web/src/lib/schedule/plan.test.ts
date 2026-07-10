import { describe, expect, it } from "vitest";
import { SCHEDULE_PLAN_COPY } from "./copy";
import { journeySteps, schedulePlan } from "./plan";

const iso = (day: number) => new Date(Date.UTC(2026, 6, day, 12, 0, 0)).toISOString();

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

describe("schedulePlan", () => {
  it("no mastered_at → acquiring journey, not yet mastered", () => {
    const plan = schedulePlan({ masteredAt: null });
    expect(plan.mastered).toBe(false);
    expect(plan.steps[0]).toEqual({ key: "acquiring", status: "current" });
    expect(plan.steps.at(-1)).toEqual({ key: "maintenance", status: "upcoming" });
  });

  it("mastered_at set → maintenance is the current journey stage", () => {
    const plan = schedulePlan({ masteredAt: iso(1) });
    expect(plan.mastered).toBe(true);
    expect(plan.steps.at(-1)).toEqual({ key: "maintenance", status: "current" });
  });
});

// Monika's rule: the /schedule copy is engine-only made human — it must never surface a dated
// prompt, weekday, or "X of 3" counter for a settling-in or booster target. This guards the copy the
// page renders (the scheduler still computes next_due_at/cadence to select targets, just off-screen).
describe("schedule plan copy is date-free (Monika rule)", () => {
  const banned =
    /tomorrow|\bin \d+ days?\b|\d+ of \d+|monday|tuesday|wednesday|thursday|friday|saturday|sunday/i;

  it("has no leaked date, weekday, or counter in the surfaced strings", () => {
    const C = SCHEDULE_PLAN_COPY;
    const strings = [
      C.window,
      C.mastery.settling,
      C.mastery.settled,
      C.booster,
      C.boosterHint,
      C.windowHeading,
      C.masteryHeading,
      C.boosterHeading,
    ];
    for (const s of strings) expect(s).not.toMatch(banned);
  });
});

import { describe, expect, it } from "vitest";
import {
  acquisitionTargetId,
  classifyTargets,
  type QueueTarget,
  selectSessionTarget,
  summarizeQueue,
} from "./queue";

const TZ = "Europe/Warsaw"; // +02:00 in July 2026
const utc = (day: number, hour = 12) => Date.UTC(2026, 6, day, hour, 0, 0);
const iso = (day: number, hour = 12) => new Date(utc(day, hour)).toISOString();

/** Compact target builder — sensible acquiring defaults, override per case. */
function t(overrides: Partial<QueueTarget> & { id: string }): QueueTarget {
  return {
    question: `q-${overrides.id}`,
    status: "active",
    createdAt: iso(1),
    scheduleMode: null,
    nextDueAt: null,
    masteredAt: null,
    ...overrides,
  };
}

/** A mastered/booster target due on `dueDay` (booster mode). */
function booster(id: string, createdDay: number, dueDay: number): QueueTarget {
  return t({
    id,
    status: "mastered",
    createdAt: iso(createdDay),
    scheduleMode: "booster",
    nextDueAt: iso(dueDay),
    masteredAt: iso(createdDay),
  });
}

describe("acquisitionTargetId", () => {
  it("picks the earliest-created still-acquiring target", () => {
    const targets = [t({ id: "b", createdAt: iso(3) }), t({ id: "a", createdAt: iso(1) })];
    expect(acquisitionTargetId(targets)).toBe("a");
  });

  it("excludes mastered targets from the acquisition slot", () => {
    const targets = [booster("m", 1, 10), t({ id: "a", createdAt: iso(2) })];
    expect(acquisitionTargetId(targets)).toBe("a");
  });

  it("is null when every target is mastered", () => {
    expect(acquisitionTargetId([booster("m1", 1, 10), booster("m2", 2, 12)])).toBeNull();
  });

  it("is null for an empty roster", () => {
    expect(acquisitionTargetId([])).toBeNull();
  });
});

describe("classifyTargets", () => {
  it("earliest active → acquiring, the rest → queued", () => {
    const targets = [t({ id: "a", createdAt: iso(1) }), t({ id: "b", createdAt: iso(2) })];
    const byId = Object.fromEntries(
      classifyTargets(targets, utc(5), TZ).map((c) => [c.target.id, c.phase]),
    );
    expect(byId).toEqual({ a: "acquiring", b: "queued" });
  });

  it("mastered + not due → maintenance; mastered + due today → due", () => {
    const targets = [booster("settled", 1, 20), booster("dueToday", 1, 5)];
    const byId = Object.fromEntries(
      classifyTargets(targets, utc(5), TZ).map((c) => [c.target.id, c.phase]),
    );
    expect(byId).toEqual({ settled: "maintenance", dueToday: "due" });
  });

  it("overdue mastered target → due", () => {
    const [c] = classifyTargets([booster("m", 1, 3)], utc(5), TZ);
    expect(c.phase).toBe("due");
    expect(c.due).toEqual({ kind: "overdue", maintenance: true });
  });
});

describe("selectSessionTarget", () => {
  it("returns null with no practicable targets", () => {
    expect(selectSessionTarget([], utc(5), TZ)).toBeNull();
  });

  it("offers the acquisition target when it is the only one", () => {
    expect(selectSessionTarget([t({ id: "a" })], utc(5), TZ)).toBe("a");
  });

  it("acquisition target wins a tie over a booster also due today", () => {
    const targets = [booster("m", 1, 5), t({ id: "acq", createdAt: iso(2) })];
    expect(selectSessionTarget(targets, utc(5), TZ)).toBe("acq");
  });

  it("acquisition (schedule-null, always due) beats an overdue booster", () => {
    // Sequential-to-mastery: the acquisition slot is the priority even over an overdue check-in.
    const targets = [booster("m", 1, 3), t({ id: "acq", createdAt: iso(2) })];
    expect(selectSessionTarget(targets, utc(5), TZ)).toBe("acq");
  });

  it("all mastered → the most-overdue booster is offered first", () => {
    const targets = [booster("recent", 1, 4), booster("stale", 1, 2)];
    expect(selectSessionTarget(targets, utc(5), TZ)).toBe("stale");
  });

  it("acquisition not-yet-due is still offered when nothing is due", () => {
    // Acquisition target in between-mode, due in 3 days; a booster due in 2 days. Acquisition wins.
    const acq = t({ id: "acq", createdAt: iso(1), scheduleMode: "between", nextDueAt: iso(8) });
    const targets = [acq, booster("m", 2, 7)];
    expect(selectSessionTarget(targets, utc(5), TZ)).toBe("acq");
  });

  it("no acquisition + nothing due → the booster due soonest", () => {
    const targets = [booster("later", 1, 12), booster("sooner", 1, 9)];
    expect(selectSessionTarget(targets, utc(5), TZ)).toBe("sooner");
  });
});

describe("summarizeQueue", () => {
  it("counts phases and everything due today", () => {
    const targets = [
      t({ id: "acq", createdAt: iso(1) }), // acquiring (always due)
      t({ id: "q", createdAt: iso(2) }), // queued (active, but always "due" as acquisition-kind)
      booster("settled", 1, 20), // maintenance
      booster("due", 1, 4), // due
    ];
    const summary = summarizeQueue(classifyTargets(targets, utc(5), TZ));
    expect(summary).toEqual({
      total: 4,
      acquiring: 1,
      queued: 1,
      maintenance: 1,
      // Offerable today: the acquiring target + the overdue booster. Queued never counts.
      dueNow: 2,
    });
  });
});

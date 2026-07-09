import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "./config";
import { defaultsForEtiology } from "./etiology";
import type { SessionState, TargetProgress } from "./session";
import {
  canResume,
  resolvedStartProbeOutcome,
  resumeSession,
  sessionReduce,
  startSession,
} from "./session";
import type { Outcome } from "./types";

const config = DEFAULT_SR_CONFIG;
const TZ = "UTC";
const DAY = 86_400_000; // ms in a day; in UTC each multiple lands on a fresh calendar day
const SOFT_CAP_MS = config.sessionSoftCapSec * 1000;

function fresh(overrides: Partial<TargetProgress> = {}): TargetProgress {
  return {
    lastSuccessSec: null,
    startStreak: 0,
    lastStartSuccessDay: null,
    badSessions: 0,
    mastered: false,
    sessionCount: 0,
    ...overrides,
  };
}

/** Deep-freeze so any accidental mutation of an input throws in strict mode. */
function frozen(state: SessionState): SessionState {
  Object.freeze(state.trials);
  Object.freeze(state.progress);
  return Object.freeze(state);
}

/** wait_elapsed then probe_result — the normal trial-loop beat. */
function probe(state: SessionState, outcome: Outcome, at: number): SessionState {
  const awaiting = sessionReduce(frozen(state), { type: "wait_elapsed", at }, config);
  return sessionReduce(frozen(awaiting), { type: "probe_result", outcome, at }, config);
}

/** Session 1 opened through teach → distractor at the base rung. */
function openSession1(at = 0): SessionState {
  const started = startSession(fresh(), { at, timeZone: TZ }, config);
  return sessionReduce(frozen(started), { type: "teach_done", at }, config);
}

describe("startSession", () => {
  it("session 1 opens in teach; not a start probe; count incremented", () => {
    const s = startSession(fresh(), { at: 0, timeZone: TZ }, config);
    expect(s.phase).toBe("teach");
    expect(s.isStartProbe).toBe(false);
    expect(s.intervalSec).toBe(0);
    expect(s.progress.sessionCount).toBe(1);
    expect(s.startedDay).toBe("1970-01-01");
    expect(s.trials).toEqual([]);
    expect(s.endReason).toBeNull();
  });

  it("session >=2 opens on the 0-delay start probe with the count incremented", () => {
    const s = startSession(fresh({ sessionCount: 3 }), { at: 0, timeZone: TZ }, config);
    expect(s.phase).toBe("awaiting_probe");
    expect(s.isStartProbe).toBe(true);
    expect(s.intervalSec).toBe(0);
    expect(s.progress.sessionCount).toBe(4);
  });

  it("does not mutate the progress it was given", () => {
    const progress = fresh({ sessionCount: 2 });
    Object.freeze(progress);
    const s = startSession(progress, { at: 0, timeZone: TZ }, config);
    expect(progress.sessionCount).toBe(2);
    expect(s.progress.sessionCount).toBe(3);
    expect(s.progress).not.toBe(progress);
  });
});

describe("teach_done (rule 2)", () => {
  it("logs an assisted 0s recall then moves to distractor at the base rung", () => {
    const started = startSession(fresh(), { at: 0, timeZone: TZ }, config);
    const s = sessionReduce(frozen(started), { type: "teach_done", at: 0 }, config);
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(config.baseIntervalSec);
    expect(s.trials).toHaveLength(1);
    expect(s.trials[0]).toMatchObject({
      intervalSec: 0,
      outcome: "recall",
      corrected: true,
      isScreening: false,
    });
  });

  it("opens at lastSuccessSec when the target already has one", () => {
    const started = startSession(fresh({ lastSuccessSec: 120 }), { at: 0, timeZone: TZ }, config);
    const s = sessionReduce(frozen(started), { type: "teach_done", at: 0 }, config);
    expect(s.intervalSec).toBe(120);
  });
});

describe("wait_elapsed (rule 4)", () => {
  it("distractor -> awaiting_probe", () => {
    const distractor = openSession1();
    const s = sessionReduce(frozen(distractor), { type: "wait_elapsed", at: 100 }, config);
    expect(s.phase).toBe("awaiting_probe");
    expect(s.intervalSec).toBe(distractor.intervalSec);
  });
});

describe("happy ladder walk (rule 5)", () => {
  it("climbs 15 -> 960 then hands off at the ceiling", () => {
    let s = openSession1(0);
    const rungs = [15, 30, 60, 120, 240, 480, 960];
    for (let i = 0; i < rungs.length - 1; i++) {
      expect(s.phase).toBe("distractor");
      expect(s.intervalSec).toBe(rungs[i]);
      s = probe(s, "recall", (i + 1) * 1000);
      expect(s.progress.lastSuccessSec).toBe(rungs[i]);
    }
    // Now at the 960 rung; a recall here is at the ceiling → handoff.
    expect(s.intervalSec).toBe(960);
    s = probe(s, "recall", 999_000);
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("ceiling");
    expect(s.handoffToScheduler).toBe(true);
    expect(s.progress.lastSuccessSec).toBe(960);
    expect(s.trials).toHaveLength(1 + rungs.length); // teach + 7 recalls
    expect(s.trials.every((t) => t.outcome === "recall")).toBe(true);
  });
});

describe("deliberate-miss revert beat (rules 5,6)", () => {
  it("recall@15, recall@30, miss@60 → correction → back to 30", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → 30
    s = probe(s, "recall", 2000); // → 60
    expect(s.intervalSec).toBe(60);
    s = probe(s, "miss", 3000);
    expect(s.phase).toBe("correcting");
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 60, outcome: "miss", corrected: true });

    s = sessionReduce(frozen(s), { type: "correction_done", at: 3000 }, config);
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(30); // reverted to last success (30), not zero, not base
    expect(s.baseMisses).toBe(0); // 30 > base, so no base-miss counted
  });
});

describe("unclear handling (rules 3,5)", () => {
  it("a single unclear then recall: no ladder move, no correction", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → 30
    const before = s.intervalSec;
    s = probe(s, "unclear", 2000);
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(before); // same rung, re-probe
    expect(s.unclearRun).toBe(1);
    expect(s.trials.at(-1)).toMatchObject({ outcome: "unclear", corrected: false });

    s = probe(s, "recall", 3000);
    expect(s.unclearRun).toBe(0);
    expect(s.intervalSec).toBe(60); // grew from 30 after the recall
  });

  it("two consecutive unclears convert to a confirmed miss", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → 30
    s = probe(s, "unclear", 2000); // run 1
    s = probe(s, "unclear", 3000); // run 2 == cap → confirmed miss
    expect(s.phase).toBe("correcting");
    expect(s.unclearRun).toBe(0);
    // literal tap preserved (addendum): unclear + corrected true
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 30, outcome: "unclear", corrected: true });
  });
});

describe("two base misses → end-on-win (rules 5,6,7)", () => {
  it("ends on a win, increments badSessions, no rescope on the first bad session", () => {
    let s = openSession1(0);
    // miss #1 at base
    s = probe(s, "miss", 1000);
    s = sessionReduce(frozen(s), { type: "correction_done", at: 1000 }, config);
    expect(s.baseMisses).toBe(1);
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(15);
    // miss #2 at base → end on win
    s = probe(s, "miss", 2000);
    s = sessionReduce(frozen(s), { type: "correction_done", at: 2000 }, config);
    expect(s.phase).toBe("end_on_win");
    expect(s.endReason).toBe("struggle");
    expect(s.baseMisses).toBe(2);
    expect(s.progress.badSessions).toBe(1);
    expect(s.rescopeRequired).toBe(false);

    const ended = sessionReduce(frozen(s), { type: "teach_done", at: 2000 }, config);
    expect(ended.phase).toBe("ended");
    expect(ended.endReason).toBe("struggle");
    expect(ended.trials.at(-1)).toMatchObject({
      intervalSec: 0,
      outcome: "recall",
      corrected: true,
    });
  });

  it("third consecutive bad session requires re-scope", () => {
    const started = startSession(
      fresh({ sessionCount: 5, badSessions: 2 }),
      {
        at: 0,
        timeZone: TZ,
      },
      config,
    );
    // session >=2 → start probe; miss it to reset streak and begin the loop
    let s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "miss", at: 0 },
      config,
    );
    s = sessionReduce(frozen(s), { type: "correction_done", at: 0 }, config); // base miss #1
    expect(s.baseMisses).toBe(1);
    s = probe(s, "miss", 1000);
    s = sessionReduce(frozen(s), { type: "correction_done", at: 1000 }, config); // base miss #2
    expect(s.phase).toBe("end_on_win");
    expect(s.progress.badSessions).toBe(3);
    expect(s.rescopeRequired).toBe(true);
    expect(s.endReason).toBe("struggle");
  });
});

describe("session-start probe streak / mastery (rule 3)", () => {
  function startRecall(progress: TargetProgress, at: number): SessionState {
    const started = startSession(progress, { at, timeZone: TZ }, config);
    return sessionReduce(frozen(started), { type: "probe_result", outcome: "recall", at }, config);
  }

  it("a start-probe recall advances the streak and continues into the loop", () => {
    const s = startRecall(fresh({ sessionCount: 2, lastSuccessSec: 240 }), 0);
    expect(s.progress.startStreak).toBe(1);
    expect(s.progress.lastStartSuccessDay).toBe("1970-01-01");
    expect(s.progress.lastSuccessSec).toBe(240); // 0s start probe never updates the rung
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(240);
    expect(s.isStartProbe).toBe(false);
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 0, outcome: "recall", corrected: false });
  });

  it("mastery on three consecutive distinct days ends the session as mastered", () => {
    const a = startRecall(fresh({ sessionCount: 4, lastSuccessSec: 480 }), 0 * DAY);
    expect(a.progress.startStreak).toBe(1);
    const b = startRecall({ ...a.progress }, 1 * DAY);
    expect(b.progress.startStreak).toBe(2);
    const c = startRecall({ ...b.progress }, 2 * DAY);
    expect(c.progress.startStreak).toBe(3);
    expect(c.progress.mastered).toBe(true);
    expect(c.phase).toBe("ended");
    expect(c.endReason).toBe("mastered");
    expect(c.handoffToScheduler).toBe(true);
  });

  it("a second same-day session neither advances nor resets the streak", () => {
    const a = startRecall(fresh({ sessionCount: 4, lastSuccessSec: 480 }), 0);
    expect(a.progress.startStreak).toBe(1);
    const sameDay = startRecall({ ...a.progress }, 3_600_000); // same UTC calendar day
    expect(sameDay.progress.startStreak).toBe(1);
    expect(sameDay.progress.lastStartSuccessDay).toBe("1970-01-01");
    expect(sameDay.phase).toBe("distractor"); // not mastered, continues
  });

  it("a skipped day does not reset the streak (count sessions, not days)", () => {
    const a = startRecall(fresh({ sessionCount: 4, lastSuccessSec: 480 }), 0);
    const c = startRecall({ ...a.progress }, 2 * DAY); // skip day 1
    expect(c.progress.startStreak).toBe(2);
    expect(c.progress.lastStartSuccessDay).toBe("1970-01-03");
  });

  it("a start-probe miss resets the streak and enters correction", () => {
    const started = startSession(
      fresh({ sessionCount: 4, startStreak: 2, lastStartSuccessDay: "1970-01-02" }),
      {
        at: 2 * DAY,
        timeZone: TZ,
      },
      config,
    );
    const s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "miss", at: 2 * DAY },
      config,
    );
    expect(s.progress.startStreak).toBe(0);
    expect(s.phase).toBe("correcting");
    expect(s.isStartProbe).toBe(false);
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 0, outcome: "miss", corrected: true });
  });

  it("two start-probe unclears convert to a miss and reset the streak", () => {
    const started = startSession(
      fresh({ sessionCount: 4, startStreak: 1, lastStartSuccessDay: "1970-01-01" }),
      {
        at: 2 * DAY,
        timeZone: TZ,
      },
      config,
    );
    let s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "unclear", at: 2 * DAY },
      config,
    );
    expect(s.isStartProbe).toBe(true); // still the start probe, re-probing at 0s
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(0);
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: 2 * DAY + 1000 }, config);
    s = sessionReduce(
      frozen(s),
      { type: "probe_result", outcome: "unclear", at: 2 * DAY + 1000 },
      config,
    );
    expect(s.phase).toBe("correcting");
    expect(s.progress.startStreak).toBe(0);
    expect(s.isStartProbe).toBe(false);
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 0, outcome: "unclear", corrected: true });
  });
});

// Mastery is a one-time handoff event: `endReason: "mastered"` fires ONLY on the
// !mastered → mastered transition. An already-mastered target's start-probe recall runs as a
// normal (booster) session so its schedule routes through `onBoosterOutcome`, not `afterMastery`.
describe("already-mastered start probe is transition-gated (booster sessions)", () => {
  const mastered = () =>
    fresh({
      sessionCount: 6,
      startStreak: config.masteryStreak,
      lastStartSuccessDay: "1970-01-02",
      mastered: true,
      lastSuccessSec: 480,
    });

  it("a distinct-day recall does NOT re-fire mastered; enters the trial loop as a booster session", () => {
    const started = startSession(mastered(), { at: 5 * DAY, timeZone: TZ }, config);
    const s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "recall", at: 5 * DAY },
      config,
    );
    expect(s.endReason).toBeNull();
    expect(s.handoffToScheduler).toBe(false);
    expect(s.phase).toBe("distractor");
    expect(s.isStartProbe).toBe(false);
    expect(s.progress.mastered).toBe(true); // stays mastered
    expect(s.progress.startStreak).toBe(config.masteryStreak); // frozen at the cap, never climbs
    expect(s.intervalSec).toBe(480); // opens at lastSuccessSec
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 0, outcome: "recall", corrected: false });
  });

  it("the first-time !mastered → mastered transition still fires exactly once", () => {
    // one shy of mastery; the crossing recall fires mastered
    const started = startSession(
      fresh({
        sessionCount: 5,
        startStreak: config.masteryStreak - 1,
        lastStartSuccessDay: "1970-01-02",
        lastSuccessSec: 480,
      }),
      { at: 5 * DAY, timeZone: TZ },
      config,
    );
    const s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "recall", at: 5 * DAY },
      config,
    );
    expect(s.endReason).toBe("mastered");
    expect(s.handoffToScheduler).toBe(true);
    expect(s.progress.mastered).toBe(true);
    expect(s.progress.startStreak).toBe(config.masteryStreak);
  });

  it("a mastered target's start-probe miss resets the streak, stays mastered, routes to correction", () => {
    const started = startSession(mastered(), { at: 5 * DAY, timeZone: TZ }, config);
    const s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "miss", at: 5 * DAY },
      config,
    );
    expect(s.phase).toBe("correcting");
    expect(s.progress.startStreak).toBe(0);
    expect(s.progress.mastered).toBe(true); // mastery is never lost on a booster miss
    expect(s.endReason).toBeNull();
    expect(s.isStartProbe).toBe(false);
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 0, outcome: "miss", corrected: true });
  });
});

describe("caregiver end (rule 8)", () => {
  it("end after a success closes directly on ended", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 1000);
    s = sessionReduce(frozen(s), { type: "end_requested", at: 2000 }, config);
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("caregiver");
  });

  it("end while correcting routes through end_on_win", () => {
    let s = openSession1(0);
    s = probe(s, "miss", 1000);
    expect(s.phase).toBe("correcting");
    s = sessionReduce(frozen(s), { type: "end_requested", at: 2000 }, config);
    expect(s.phase).toBe("end_on_win");
    expect(s.endReason).toBe("caregiver");
    const ended = sessionReduce(frozen(s), { type: "teach_done", at: 2000 }, config);
    expect(ended.phase).toBe("ended");
    expect(ended.trials.at(-1)).toMatchObject({
      intervalSec: 0,
      outcome: "recall",
      corrected: true,
    });
  });

  it("end in distractor right after a corrected miss still routes through end_on_win", () => {
    let s = openSession1(0);
    s = probe(s, "miss", 1000);
    s = sessionReduce(frozen(s), { type: "correction_done", at: 1000 }, config); // distractor, last trial miss
    expect(s.phase).toBe("distractor");
    s = sessionReduce(frozen(s), { type: "end_requested", at: 2000 }, config);
    expect(s.phase).toBe("end_on_win");
  });

  it("end during teach (no trials) closes directly", () => {
    const started = startSession(fresh(), { at: 0, timeZone: TZ }, config);
    const s = sessionReduce(frozen(started), { type: "end_requested", at: 100 }, config);
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("caregiver");
  });

  it("end after a trailing below-cap unclear routes through end_on_win (addendum 2)", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → 30, last trial recall
    s = probe(s, "unclear", 2000); // below cap: unclearRun 1, corrected false, back to distractor
    expect(s.trials.at(-1)).toMatchObject({ outcome: "unclear", corrected: false });
    s = sessionReduce(frozen(s), { type: "end_requested", at: 3000 }, config);
    expect(s.phase).toBe("end_on_win");
    expect(s.endReason).toBe("caregiver");
    const ended = sessionReduce(frozen(s), { type: "teach_done", at: 3000 }, config);
    expect(ended.phase).toBe("ended");
    expect(ended.trials.at(-1)).toMatchObject({
      intervalSec: 0,
      outcome: "recall",
      corrected: true,
    });
  });
});

// The cap gates STARTING a new distractor gap, never finishing one (PLAN §4.2 withinSessionBounds
// at the loop top). A probe/wait allowed to run resolves normally; the cap only declines the *next*
// gap. That makes the ceiling rung reachable — succeeding past-cap on the last gap hands off.
describe("soft cap (rule 9) — cap gates a new gap, never finishes one", () => {
  it("a recall past the cap at a non-ceiling rung blocks the next gap → ended/caregiver", () => {
    // The distractor gap finishes sub-cap; the caregiver taps recall at the cap. The recall logs,
    // but the *next* gap (30→60) is blocked, closing on the just-earned win.
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → distractor@30
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: SOFT_CAP_MS - 1000 }, config);
    s = sessionReduce(
      frozen(s),
      { type: "probe_result", outcome: "recall", at: SOFT_CAP_MS },
      config,
    );
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("caregiver");
    expect(s.progress.lastSuccessSec).toBe(30);
    expect(s.trials.at(-1)).toMatchObject({ outcome: "recall" });
  });

  it("a miss past the cap resolves to correcting; the following correction_done blocks the gap", () => {
    // The miss is not a new-gap start, so it resolves normally to correcting. The cap only bites
    // when correction_done would re-enter distractor → end_on_win.
    let s = openSession1(0);
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: SOFT_CAP_MS - 1000 }, config);
    s = sessionReduce(
      frozen(s),
      { type: "probe_result", outcome: "miss", at: SOFT_CAP_MS },
      config,
    );
    expect(s.phase).toBe("correcting");
    expect(s.trials.at(-1)).toMatchObject({ outcome: "miss", corrected: true });
    s = sessionReduce(frozen(s), { type: "correction_done", at: SOFT_CAP_MS }, config);
    expect(s.phase).toBe("end_on_win");
    expect(s.endReason).toBe("caregiver");
  });

  it("wait_elapsed landing past the cap is never swallowed → awaiting_probe", () => {
    // A gap started sub-cap is always followed by its probe, even if the wait lands past the cap.
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // distractor@30, gap started sub-cap
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: SOFT_CAP_MS + 5000 }, config);
    expect(s.phase).toBe("awaiting_probe");
    expect(s.intervalSec).toBe(30);
  });

  it("a below-cap unclear past the cap blocks its re-probe gap → end_on_win", () => {
    let s = openSession1(0);
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: SOFT_CAP_MS - 1000 }, config);
    s = sessionReduce(
      frozen(s),
      { type: "probe_result", outcome: "unclear", at: SOFT_CAP_MS },
      config,
    );
    expect(s.phase).toBe("end_on_win");
    expect(s.endReason).toBe("caregiver");
    expect(s.trials.at(-1)).toMatchObject({ outcome: "unclear", corrected: false });
  });

  it("wait_elapsed past the cap after a below-cap unclear is still never swallowed → awaiting_probe", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → 30, last trial recall
    s = probe(s, "unclear", 2000); // below cap: back to distractor, last trial unclear/uncorrected
    expect(s.phase).toBe("distractor");
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: SOFT_CAP_MS + 5000 }, config);
    expect(s.phase).toBe("awaiting_probe");
  });

  it("the ceiling rung is reachable past the cap (growth 2): recall@960 → ceiling handoff", () => {
    // start-probe recall opens at lastSuccess 480; recall grows to 960 (a gap started sub-cap);
    // that gap's wait lands past the cap but is not swallowed; the recall at 960 hits the ceiling.
    const started = startSession(
      fresh({ sessionCount: 1, lastSuccessSec: 480 }),
      { at: 0, timeZone: TZ },
      config,
    );
    let s = sessionReduce(
      frozen(started),
      { type: "probe_result", outcome: "recall", at: 0 },
      config,
    );
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(480);
    s = probe(s, "recall", 480_000); // gap 480 sub-cap; grows to 960
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(960);
    // gap 960 started at 480s (< cap); its wait lands at ~1445s (past cap) but is not swallowed.
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: 1_445_000 }, config);
    expect(s.phase).toBe("awaiting_probe");
    s = sessionReduce(
      frozen(s),
      { type: "probe_result", outcome: "recall", at: 1_445_000 },
      config,
    );
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("ceiling");
    expect(s.handoffToScheduler).toBe(true);
    expect(s.progress.lastSuccessSec).toBe(960);
  });

  it("the ceiling rung is reachable past the cap (alzheimers, growth 1.5)", () => {
    const alz = defaultsForEtiology("alzheimers").config;
    // lastSuccess 640 → recall grows to min(640×1.5, 960) = 960; the next recall hits the ceiling.
    const started = startSession(
      fresh({ sessionCount: 1, lastSuccessSec: 640 }),
      { at: 0, timeZone: TZ },
      alz,
    );
    let s = sessionReduce(frozen(started), { type: "probe_result", outcome: "recall", at: 0 }, alz);
    expect(s.intervalSec).toBe(640);
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: 640_000 }, alz);
    s = sessionReduce(frozen(s), { type: "probe_result", outcome: "recall", at: 640_000 }, alz);
    expect(s.phase).toBe("distractor");
    expect(s.intervalSec).toBe(960);
    // gap 960 started at 640s (< cap); wait lands past cap, not swallowed; recall@960 → ceiling.
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: 1_605_000 }, alz);
    expect(s.phase).toBe("awaiting_probe");
    s = sessionReduce(frozen(s), { type: "probe_result", outcome: "recall", at: 1_605_000 }, alz);
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("ceiling");
    expect(s.handoffToScheduler).toBe(true);
    expect(s.progress.lastSuccessSec).toBe(960);
  });

  it("a correction_done past the cap declines the reverted gap → end_on_win", () => {
    // Explicit isolation of the correction_done distractor-entry guard.
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // → 30, lastSuccess 30
    s = probe(s, "recall", 2000); // → 60, lastSuccess 60
    s = probe(s, "miss", 3000); // 60 miss → correcting
    expect(s.phase).toBe("correcting");
    s = sessionReduce(frozen(s), { type: "correction_done", at: SOFT_CAP_MS }, config);
    expect(s.phase).toBe("end_on_win"); // revert to 60 would start a new gap past cap
    expect(s.endReason).toBe("caregiver");
  });
});

describe("resume (rule 11)", () => {
  function distractorAt60(): SessionState {
    let s = openSession1(0);
    s = probe(s, "recall", 1000); // lastSuccess 15 → 30
    s = probe(s, "recall", 2000); // lastSuccess 30 → 60
    return s; // distractor@60, lastSuccessSec 30, startedDay 1970-01-01
  }

  it("resumes the same day at the last-success rung", () => {
    const s = distractorAt60();
    expect(canResume(s, 3_600_000)).toBe(true); // same UTC day
    const resumed = resumeSession(s, 3_600_000, config);
    expect(resumed).not.toBeNull();
    expect(resumed?.phase).toBe("distractor");
    expect(resumed?.intervalSec).toBe(30); // lastSuccessSec
    expect(resumed?.unclearRun).toBe(0);
    expect(resumed?.isStartProbe).toBe(false);
  });

  it("cannot resume on a later day", () => {
    const s = distractorAt60();
    expect(canResume(s, DAY)).toBe(false);
    expect(resumeSession(s, DAY, config)).toBeNull();
  });

  it("cannot resume an ended session", () => {
    let s = openSession1(0);
    s = sessionReduce(frozen(s), { type: "end_requested", at: 100 }, config);
    expect(s.phase).toBe("ended");
    expect(canResume(s, 100)).toBe(false);
    expect(resumeSession(s, 100, config)).toBeNull();
  });
});

describe("invalid events are no-ops (rule 10)", () => {
  it("probe_result in distractor returns the same state", () => {
    const s = frozen(openSession1(0));
    expect(sessionReduce(s, { type: "probe_result", outcome: "recall", at: 1 }, config)).toBe(s);
  });

  it("correction_done in awaiting_probe returns the same state", () => {
    const distractor = frozen(openSession1(0));
    const awaiting = frozen(sessionReduce(distractor, { type: "wait_elapsed", at: 1 }, config));
    expect(sessionReduce(awaiting, { type: "correction_done", at: 2 }, config)).toBe(awaiting);
  });

  it("teach_done in distractor returns the same state", () => {
    const s = frozen(openSession1(0));
    expect(sessionReduce(s, { type: "teach_done", at: 1 }, config)).toBe(s);
  });

  it("any event after ended returns the same state", () => {
    let s = openSession1(0);
    s = frozen(sessionReduce(s, { type: "end_requested", at: 1 }, config));
    expect(sessionReduce(s, { type: "probe_result", outcome: "recall", at: 2 }, config)).toBe(s);
    expect(sessionReduce(s, { type: "wait_elapsed", at: 2 }, config)).toBe(s);
    expect(sessionReduce(s, { type: "teach_done", at: 2 }, config)).toBe(s);
  });
});

describe("full scripted session — exact trial log", () => {
  it("teach, recall@15, miss@30, recall@15, caregiver end", () => {
    let s = openSession1(0);
    s = probe(s, "recall", 100); // trial: 15 recall → interval 30
    s = probe(s, "miss", 200); // trial: 30 miss → correcting
    s = sessionReduce(frozen(s), { type: "correction_done", at: 200 }, config); // revert to 15, baseMiss 1
    s = probe(s, "recall", 300); // trial: 15 recall → interval 30
    s = sessionReduce(frozen(s), { type: "end_requested", at: 400 }, config);
    expect(s.phase).toBe("ended");
    expect(s.endReason).toBe("caregiver");
    expect(s.trials.map((t) => [t.intervalSec, t.outcome, t.corrected])).toEqual([
      [0, "recall", true],
      [15, "recall", false],
      [30, "miss", true],
      [15, "recall", false],
    ]);
    expect(s.trials.every((t) => t.isScreening === false)).toBe(true);
  });
});

describe("interval_override (practitioner override)", () => {
  it("sets intervalSec to the given value while in distractor (in-bounds)", () => {
    const s = openSession1(0); // distractor@15
    const overridden = sessionReduce(
      frozen(s),
      { type: "interval_override", intervalSec: 100, at: 10 },
      config,
    );
    expect(overridden.phase).toBe("distractor");
    expect(overridden.intervalSec).toBe(100);
  });

  it("clamps below base up to base, above max down to max, rounds non-integers", () => {
    const s = frozen(openSession1(0)); // distractor@15, base 15, max 960
    const belowBase = sessionReduce(
      s,
      { type: "interval_override", intervalSec: -50, at: 10 },
      config,
    );
    expect(belowBase.intervalSec).toBe(config.baseIntervalSec);

    const aboveMax = sessionReduce(
      s,
      { type: "interval_override", intervalSec: 5000, at: 10 },
      config,
    );
    expect(aboveMax.intervalSec).toBe(config.maxIntervalSec);

    const rounded = sessionReduce(
      s,
      { type: "interval_override", intervalSec: 47.6, at: 10 },
      config,
    );
    expect(rounded.intervalSec).toBe(48);
  });

  it("is an identity no-op outside distractor: teach, awaiting_probe, correcting, end_on_win, ended", () => {
    const teach = frozen(startSession(fresh(), { at: 0, timeZone: TZ }, config));
    expect(
      sessionReduce(teach, { type: "interval_override", intervalSec: 100, at: 5 }, config),
    ).toBe(teach);

    const awaiting = frozen(
      sessionReduce(frozen(openSession1(0)), { type: "wait_elapsed", at: 100 }, config),
    );
    expect(
      sessionReduce(awaiting, { type: "interval_override", intervalSec: 100, at: 5 }, config),
    ).toBe(awaiting);

    const correcting = frozen(probe(openSession1(0), "miss", 1000));
    expect(
      sessionReduce(correcting, { type: "interval_override", intervalSec: 100, at: 5 }, config),
    ).toBe(correcting);

    let endOnWin = openSession1(0);
    endOnWin = probe(endOnWin, "miss", 1000);
    endOnWin = frozen(sessionReduce(frozen(endOnWin), { type: "end_requested", at: 2000 }, config));
    expect(endOnWin.phase).toBe("end_on_win");
    expect(
      sessionReduce(endOnWin, { type: "interval_override", intervalSec: 100, at: 5 }, config),
    ).toBe(endOnWin);

    let ended = openSession1(0);
    ended = frozen(sessionReduce(frozen(ended), { type: "end_requested", at: 100 }, config));
    expect(ended.phase).toBe("ended");
    expect(
      sessionReduce(ended, { type: "interval_override", intervalSec: 100, at: 5 }, config),
    ).toBe(ended);
  });

  it("a recall after an overridden interval sets lastSuccessSec to the override and grows from it", () => {
    let s = openSession1(0); // distractor@15
    s = sessionReduce(frozen(s), { type: "interval_override", intervalSec: 50, at: 10 }, config);
    expect(s.intervalSec).toBe(50);
    s = probe(s, "recall", 100);
    expect(s.progress.lastSuccessSec).toBe(50);
    expect(s.intervalSec).toBe(100); // min(50 * growthFactor(2), max)
  });

  it("a miss after an overridden interval reverts to the pre-override lastSuccessSec, not the override", () => {
    let s = openSession1(0); // distractor@15
    s = probe(s, "recall", 100); // recall@15 -> lastSuccessSec 15, distractor@30
    expect(s.progress.lastSuccessSec).toBe(15);
    s = sessionReduce(frozen(s), { type: "interval_override", intervalSec: 500, at: 150 }, config);
    expect(s.intervalSec).toBe(500);
    s = probe(s, "miss", 200); // -> correcting
    expect(s.phase).toBe("correcting");
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 500, outcome: "miss", corrected: true });
    s = sessionReduce(frozen(s), { type: "correction_done", at: 200 }, config);
    expect(s.intervalSec).toBe(15); // reverted to the last real success, not the override
  });

  it("does not touch unclearRun, baseMisses, progress or trials", () => {
    let s = openSession1(0);
    s = probe(s, "miss", 1000);
    s = sessionReduce(frozen(s), { type: "correction_done", at: 1000 }, config); // distractor, baseMisses 1
    expect(s.baseMisses).toBe(1);
    const overridden = sessionReduce(
      frozen(s),
      { type: "interval_override", intervalSec: 999, at: 1000 },
      config,
    );
    expect(overridden.baseMisses).toBe(s.baseMisses);
    expect(overridden.unclearRun).toBe(s.unclearRun);
    expect(overridden.progress).toBe(s.progress);
    expect(overridden.trials).toBe(s.trials);
  });
});

describe("resolvedStartProbeOutcome", () => {
  function openStartProbe(at = 2 * DAY): SessionState {
    return startSession(fresh({ sessionCount: 4, startStreak: 1 }), { at, timeZone: TZ }, config);
  }

  it('a direct recall resolves to "recall"', () => {
    const s = sessionReduce(
      frozen(openStartProbe()),
      { type: "probe_result", outcome: "recall", at: 2 * DAY },
      config,
    );
    expect(resolvedStartProbeOutcome(s.trials)).toBe("recall");
  });

  it('a direct miss resolves to "miss"', () => {
    const s = sessionReduce(
      frozen(openStartProbe()),
      { type: "probe_result", outcome: "miss", at: 2 * DAY },
      config,
    );
    expect(resolvedStartProbeOutcome(s.trials)).toBe("miss");
  });

  it('a double-unclear conversion resolves to "miss" (PLAN §4.2 v4), not "unclear"', () => {
    let s = sessionReduce(
      frozen(openStartProbe()),
      { type: "probe_result", outcome: "unclear", at: 2 * DAY },
      config,
    );
    s = sessionReduce(frozen(s), { type: "wait_elapsed", at: 2 * DAY + 1000 }, config);
    s = sessionReduce(
      frozen(s),
      { type: "probe_result", outcome: "unclear", at: 2 * DAY + 1000 },
      config,
    );
    expect(s.trials.at(-1)).toMatchObject({ outcome: "unclear", corrected: true });
    expect(resolvedStartProbeOutcome(s.trials)).toBe("miss");
  });

  it("a single still-open (below-cap) unclear is not yet resolved → null", () => {
    const s = sessionReduce(
      frozen(openStartProbe()),
      { type: "probe_result", outcome: "unclear", at: 2 * DAY },
      config,
    );
    expect(resolvedStartProbeOutcome(s.trials)).toBeNull();
  });

  it("no trials → null", () => {
    expect(resolvedStartProbeOutcome([])).toBeNull();
  });

  it("a same-day resume that abandoned an open start-probe unclear must not misattribute the next ordinary trial-loop outcome as the start-probe resolution", () => {
    // startSession → unclear (open, corrected: false) → resumeSession → recall.
    const s = sessionReduce(
      frozen(openStartProbe()),
      { type: "probe_result", outcome: "unclear", at: 2 * DAY },
      config,
    );
    expect(s.trials.at(-1)).toMatchObject({ intervalSec: 0, outcome: "unclear", corrected: false });

    const resumed = resumeSession(s, 2 * DAY + 500, config);
    expect(resumed).not.toBeNull();
    expect(resumed?.isStartProbe).toBe(false); // resume demotes to an ordinary trial rung

    const final = probe(resumed as SessionState, "recall", 2 * DAY + 1000);
    expect(final.trials.map((t) => [t.intervalSec, t.outcome, t.corrected])).toEqual([
      [0, "unclear", false],
      [config.baseIntervalSec, "recall", false],
    ]);
    // The recall belongs to the trial loop, not the start probe — must not move the schedule.
    expect(resolvedStartProbeOutcome(final.trials)).toBeNull();
  });
});

describe("purity — inputs are never mutated (rule 12)", () => {
  it("a full run leaves every intermediate frozen state intact", () => {
    // If any transition mutated its input, freeze() would make it throw.
    let s = openSession1(0);
    s = probe(s, "recall", 1000);
    s = probe(s, "unclear", 2000);
    s = probe(s, "miss", 3000);
    s = sessionReduce(frozen(s), { type: "correction_done", at: 3000 }, config);
    expect(s.phase).toBe("distractor");
  });
});

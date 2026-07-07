import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG, type SrConfig } from "./config";
import { calendarDayInTz } from "./dates";
import { defaultsForEtiology } from "./etiology";
import type { SessionEvent, SessionPhase, SessionState, TargetProgress } from "./session";
import { sessionReduce, startSession } from "./session";
import type { Outcome } from "./types";

const TZ = "UTC";
const DAY = 86_400_000;
const SEED = 42;
const RUNS = 200;

const ETIOLOGY_CONFIGS: ReadonlyArray<{ name: string; config: SrConfig }> = [
  { name: "default", config: DEFAULT_SR_CONFIG },
  { name: "alzheimers", config: defaultsForEtiology("alzheimers").config },
  { name: "lewy", config: defaultsForEtiology("lewy").config },
];

/** Reachable within-session rungs for a config: base, ×growth, capped at the ceiling. */
function rungs(config: SrConfig): number[] {
  const out: number[] = [];
  let v = config.baseIntervalSec;
  while (v < config.maxIntervalSec) {
    out.push(v);
    v = Math.min(v * config.growthFactor, config.maxIntervalSec);
  }
  out.push(config.maxIntervalSec);
  return out;
}

/** Arbitrary starting TargetProgress — including mastered / mid-streak variants. */
function progressArb(config: SrConfig): fc.Arbitrary<TargetProgress> {
  return fc.record({
    lastSuccessSec: fc.option(fc.constantFrom(...rungs(config)), { nil: null }),
    startStreak: fc.nat({ max: config.masteryStreak }),
    lastStartSuccessDay: fc.option(fc.constantFrom("1970-01-01", "1970-01-02"), { nil: null }),
    badSessions: fc.nat({ max: config.badSessionsToRescope }),
    mastered: fc.boolean(),
    sessionCount: fc.nat({ max: 6 }),
  });
}

type PartialEvent =
  | { type: "wait_elapsed" }
  | { type: "teach_done" }
  | { type: "correction_done" }
  | { type: "end_requested" }
  | { type: "probe_result"; outcome: Outcome };

const partialEventArb: fc.Arbitrary<PartialEvent> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<PartialEvent>({ type: "wait_elapsed" }) },
  {
    weight: 3,
    arbitrary: fc
      .constantFrom<Outcome>("recall", "miss", "unclear")
      .map<PartialEvent>((outcome) => ({ type: "probe_result", outcome })),
  },
  { weight: 2, arbitrary: fc.constant<PartialEvent>({ type: "teach_done" }) },
  { weight: 2, arbitrary: fc.constant<PartialEvent>({ type: "correction_done" }) },
  { weight: 1, arbitrary: fc.constant<PartialEvent>({ type: "end_requested" }) },
);

/** A sequence of events with monotonically non-decreasing `at` timestamps. */
// Deltas stay well under the soft cap (1200s) so most steps land sub-cap — this is what lets the
// trace reach `correcting`, unclear re-probes and ladder climbs; longer sequences still cross the
// cap and exercise the soft-cap close branches.
const seqArb: fc.Arbitrary<SessionEvent[]> = fc
  .array(fc.tuple(partialEventArb, fc.integer({ min: 0, max: 120_000 })), {
    minLength: 1,
    maxLength: 40,
  })
  .map((pairs) => {
    let at = 0;
    return pairs.map(([pe, delta]): SessionEvent => {
      at += delta;
      if (pe.type === "probe_result") return { type: "probe_result", outcome: pe.outcome, at };
      return { type: pe.type, at };
    });
  });

function freeze(s: SessionState): SessionState {
  Object.freeze(s.trials);
  Object.freeze(s.progress);
  return Object.freeze(s);
}

interface Step {
  prev: SessionState;
  event: SessionEvent;
  next: SessionState;
}

/** Fold an event sequence through the real reducer, freezing each state to catch mutation. */
function trace(progress: TargetProgress, events: SessionEvent[], config: SrConfig): Step[] {
  let state = freeze(startSession(progress, { at: 0, timeZone: TZ }, config));
  const steps: Step[] = [];
  for (const event of events) {
    const next = freeze(sessionReduce(state, event, config));
    steps.push({ prev: state, event, next });
    state = next;
  }
  return steps;
}

const LEGAL_EDGES = new Set<string>([
  "teach->distractor",
  "teach->ended",
  "distractor->awaiting_probe",
  "distractor->end_on_win",
  "distractor->ended",
  "awaiting_probe->distractor",
  "awaiting_probe->correcting",
  "awaiting_probe->end_on_win",
  "awaiting_probe->ended",
  "correcting->distractor",
  "correcting->end_on_win",
  "end_on_win->ended",
]);

describe("SR engine invariants (property-based, seed=42)", () => {
  // 1. Interval bounds: 0 <= intervalSec <= maxIntervalSec always; and >= baseIntervalSec while
  //    in a real (non-start-probe) distractor/awaiting_probe rung. The 0s start probe is exempt
  //    (its re-probe legitimately sits in distractor at intervalSec 0).
  for (const { name, config } of ETIOLOGY_CONFIGS) {
    it(`1. interval stays within [0, max] and >= base on real rungs (${name})`, () => {
      let realRungHits = 0;
      fc.assert(
        fc.property(progressArb(config), seqArb, (progress, events) => {
          for (const { next } of trace(progress, events, config)) {
            expect(next.intervalSec).toBeGreaterThanOrEqual(0);
            expect(next.intervalSec).toBeLessThanOrEqual(config.maxIntervalSec);
            const onRealRung =
              (next.phase === "distractor" || next.phase === "awaiting_probe") &&
              !next.isStartProbe;
            if (onRealRung) {
              realRungHits += 1;
              expect(next.intervalSec).toBeGreaterThanOrEqual(config.baseIntervalSec);
            }
          }
        }),
        { seed: SEED, numRuns: RUNS },
      );
      expect(realRungHits).toBeGreaterThan(0);
    });
  }

  // 2. A completed correction never reverts below the last success: the new rung is exactly
  //    lastSuccessSec ?? base.
  it("2. correction_done reverts to lastSuccessSec ?? base, never lower", () => {
    const config = DEFAULT_SR_CONFIG;
    let correctingHits = 0;
    fc.assert(
      fc.property(progressArb(config), seqArb, (progress, events) => {
        for (const { next } of trace(progress, events, config)) {
          if (next.phase !== "correcting") continue;
          correctingHits += 1;
          const after = sessionReduce(
            next,
            { type: "correction_done", at: next.startedAt },
            config,
          );
          // Independently derived (not via resetIntervalSec) so this doesn't co-mutate with prod.
          const expected = next.progress.lastSuccessSec ?? config.baseIntervalSec;
          expect(after.intervalSec).toBe(expected);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(correctingHits).toBeGreaterThanOrEqual(5);
  });

  // 3. A below-cap unclear never moves the ladder: intervalSec, lastSuccessSec, baseMisses and
  //    startStreak are untouched, and it never enters correction.
  it("3. a below-cap unclear leaves the ladder and streak untouched", () => {
    const config = DEFAULT_SR_CONFIG;
    let freshHits = 0;
    fc.assert(
      fc.property(progressArb(config), seqArb, (progress, events) => {
        for (const { next } of trace(progress, events, config)) {
          const fresh =
            next.phase === "awaiting_probe" && !next.isStartProbe && next.unclearRun === 0;
          if (!fresh) continue;
          freshHits += 1;
          const at = next.startedAt; // sub-soft-cap, so the unclear is a pure re-probe
          const after = sessionReduce(
            next,
            { type: "probe_result", outcome: "unclear", at },
            config,
          );
          expect(after.phase).not.toBe("correcting");
          expect(after.intervalSec).toBe(next.intervalSec);
          expect(after.progress.lastSuccessSec).toBe(next.progress.lastSuccessSec);
          expect(after.baseMisses).toBe(next.baseMisses);
          expect(after.progress.startStreak).toBe(next.progress.startStreak);
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(freshHits).toBeGreaterThan(0);
  });

  // 4. Mastery needs exactly masteryStreak distinct-day session-start recalls. Scripted
  //    multi-session histories with arbitrary day gaps (incl. same-day repeats) and interleaved
  //    misses; a reference model must agree with the engine at every session.
  it("4. mastery iff masteryStreak consecutive distinct-day start recalls", () => {
    const config = DEFAULT_SR_CONFIG;
    const sessionArb = fc.array(
      fc.record({
        gap: fc.nat({ max: 2 }), // 0 = same day, 1 = next day, 2 = skip a day
        outcome: fc.constantFrom<Outcome>("recall", "miss"),
      }),
      { minLength: 1, maxLength: 10 },
    );
    fc.assert(
      fc.property(sessionArb, (sessions) => {
        let progress: TargetProgress = {
          lastSuccessSec: 480,
          startStreak: 0,
          lastStartSuccessDay: null,
          badSessions: 0,
          mastered: false,
          sessionCount: 1, // >= 1 so every session opens on the start probe
        };
        let streak = 0;
        let lastDay: string | null = null;
        let mastered = false;
        let day = 0;

        for (const { gap, outcome } of sessions) {
          day += gap;
          const at = day * DAY;
          const started = startSession(progress, { at, timeZone: TZ }, config);
          const next = sessionReduce(started, { type: "probe_result", outcome, at }, config);

          const calDay = calendarDayInTz(at, TZ);
          if (outcome === "recall") {
            if (lastDay === null || lastDay !== calDay) {
              streak += 1;
              lastDay = calDay;
            }
            if (streak >= config.masteryStreak) mastered = true;
          } else {
            streak = 0;
          }

          expect(next.progress.startStreak).toBe(streak);
          expect(next.progress.mastered).toBe(mastered);
          if (mastered) {
            expect(next.phase).toBe("ended");
            expect(next.endReason).toBe("mastered");
            break; // target is done; nothing further to drive
          }
          progress = next.progress;
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  // 5. No illegal transitions: every phase change is in the legal edge set, and any same-phase
  //    result is an exact identity no-op (stray events change nothing). Also run under etiology
  //    configs.
  for (const { name, config } of ETIOLOGY_CONFIGS) {
    it(`5. phase transitions stay within the legal edge set (${name})`, () => {
      let strayNoOpHits = 0;
      fc.assert(
        fc.property(progressArb(config), seqArb, (progress, events) => {
          for (const { prev, next } of trace(progress, events, config)) {
            const from: SessionPhase = prev.phase;
            const to: SessionPhase = next.phase;
            if (from === to) {
              strayNoOpHits += 1;
              expect(next).toBe(prev); // same-phase ⟹ genuine no-op (identical object)
            } else {
              expect(LEGAL_EDGES.has(`${from}->${to}`)).toBe(true);
            }
          }
        }),
        { seed: SEED, numRuns: RUNS },
      );
      expect(strayNoOpHits).toBeGreaterThan(0);
    });
  }

  // 6. Sessions always end on a win: any reached "ended" state with >= 1 trial has a recall last.
  it("6. an ended session with any trials ends on a recall", () => {
    const config = DEFAULT_SR_CONFIG;
    let endedWithTrialsHits = 0;
    fc.assert(
      fc.property(progressArb(config), seqArb, (progress, events) => {
        for (const { next } of trace(progress, events, config)) {
          if (next.phase === "ended" && next.trials.length > 0) {
            endedWithTrialsHits += 1;
            expect(next.trials.at(-1)?.outcome).toBe("recall");
          }
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
    expect(endedWithTrialsHits).toBeGreaterThan(0);
  });

  // 7. Trial-log integrity: trials only ever append (prior entries are the same objects, never
  //    rewritten) and `at` values are non-decreasing.
  it("7. the trial log only appends and keeps `at` non-decreasing", () => {
    const config = DEFAULT_SR_CONFIG;
    fc.assert(
      fc.property(progressArb(config), seqArb, (progress, events) => {
        for (const { prev, next } of trace(progress, events, config)) {
          expect(next.trials.length).toBeGreaterThanOrEqual(prev.trials.length);
          for (let i = 0; i < prev.trials.length; i++) {
            expect(next.trials[i]).toBe(prev.trials[i]); // existing entries never rewritten
          }
          for (let i = 1; i < next.trials.length; i++) {
            const a = next.trials[i - 1];
            const b = next.trials[i];
            if (a && b) expect(b.at).toBeGreaterThanOrEqual(a.at);
          }
        }
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

import {
  DEFAULT_SR_CONFIG,
  type SessionState,
  sessionReduce,
  startSession,
  type TargetProgress,
} from "@keepsake/core/sr";
import { describe, expect, it, vi } from "vitest";
import { SessionRunner } from "./runner";
import { demoWaitMs } from "./wait-policy";

const config = DEFAULT_SR_CONFIG;
const TZ = "UTC";
const DEMO_SPEED = 1; // keeps demoWaitMs == real ms for easy assertions

function freshProgress(overrides: Partial<TargetProgress> = {}): TargetProgress {
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

/** Session 1 driven through teach → distractor at the base rung (15s), via the real engine. */
function distractorState(at = 0): SessionState {
  const started = startSession(freshProgress(), { at, timeZone: TZ }, config);
  return sessionReduce(started, { type: "teach_done", at }, config);
}

interface FakeTimer {
  ms: number;
  fn: () => void;
  cancelled: boolean;
}

function fakeTimers() {
  const timers: FakeTimer[] = [];
  const setTimer = (ms: number, fn: () => void) => {
    const timer: FakeTimer = { ms, fn, cancelled: false };
    timers.push(timer);
    return () => {
      timer.cancelled = true;
    };
  };
  return { timers, setTimer };
}

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

function makeRunner(initial: SessionState) {
  const { timers, setTimer } = fakeTimers();
  const clock = fakeClock(0);
  const onChange = vi.fn();
  const runner = new SessionRunner(initial, {
    now: clock.now,
    setTimer,
    demoSpeed: DEMO_SPEED,
    config,
    onChange,
  });
  return { runner, timers, clock, onChange };
}

describe("SessionRunner", () => {
  it("construction in distractor phase schedules exactly one timer; firing it lands in awaiting_probe", () => {
    const initial = distractorState(0);
    const { runner, timers, onChange } = makeRunner(initial);

    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(demoWaitMs(initial.intervalSec, DEMO_SPEED));
    expect(runner.currentWait).toEqual({
      startedAtMs: 0,
      durationMs: demoWaitMs(initial.intervalSec, DEMO_SPEED),
      intervalSec: initial.intervalSec,
    });

    timers[0].fn();

    expect(runner.state.phase).toBe("awaiting_probe");
    expect(runner.currentWait).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(runner.state, { type: "wait_elapsed", at: 0 });
  });

  it("probe(recall) grows the interval and reconciles a fresh timer + currentWait", () => {
    const { runner, timers, clock } = makeRunner(distractorState(0));

    timers[0].fn(); // wait_elapsed -> awaiting_probe
    clock.advance(1_000);
    runner.probe("recall");

    expect(runner.state.phase).toBe("distractor");
    expect(runner.state.intervalSec).toBe(30);
    expect(timers).toHaveLength(2);
    expect(timers[1].ms).toBe(demoWaitMs(30, DEMO_SPEED));
    expect(timers[1].cancelled).toBe(false);
    expect(runner.currentWait).toEqual({
      startedAtMs: 1_000,
      durationMs: demoWaitMs(30, DEMO_SPEED),
      intervalSec: 30,
    });
  });

  it("probe(unclear) re-enters distractor at the SAME intervalSec — scheduled duration unchanged", () => {
    const { runner, timers } = makeRunner(distractorState(0));

    timers[0].fn(); // wait_elapsed -> awaiting_probe
    runner.probe("unclear");

    expect(runner.state.phase).toBe("distractor");
    expect(runner.state.intervalSec).toBe(15);
    expect(timers).toHaveLength(2);
    expect(timers[1].ms).toBe(demoWaitMs(15, DEMO_SPEED));
    expect(timers[1].ms).toBe(timers[0].ms);
  });

  it("overrideInterval mid-wait cancels the pending timer and schedules the clamped interval", () => {
    const { runner, timers, clock } = makeRunner(distractorState(0));

    clock.advance(2_000);
    runner.overrideInterval(2_000); // above config.maxIntervalSec (960) — engine clamps it

    expect(timers[0].cancelled).toBe(true);
    expect(timers).toHaveLength(2);
    expect(runner.state.intervalSec).toBe(960);
    expect(timers[1].ms).toBe(demoWaitMs(960, DEMO_SPEED));
    expect(timers[1].cancelled).toBe(false);
    expect(runner.currentWait).toEqual({
      startedAtMs: 2_000,
      durationMs: demoWaitMs(960, DEMO_SPEED),
      intervalSec: 960,
    });
  });

  it("overrideInterval outside distractor is an engine no-op — schedules nothing, state unchanged", () => {
    const { runner, timers } = makeRunner(distractorState(0));

    timers[0].fn(); // wait_elapsed -> awaiting_probe
    const stateBefore = runner.state;

    runner.overrideInterval(100);

    expect(runner.state).toBe(stateBefore); // identity no-op from the engine
    expect(timers).toHaveLength(1); // nothing new scheduled
    expect(runner.currentWait).toBeNull();
  });

  it("a phase leaving distractor via any event (endRequested) cancels the pending timer", () => {
    const { runner, timers } = makeRunner(distractorState(0));

    runner.endRequested();

    expect(timers[0].cancelled).toBe(true);
    expect(runner.currentWait).toBeNull();
    expect(runner.state.phase).toBe("ended");
  });

  it("onChange fires exactly once per dispatched event, with the post-reduce state", () => {
    const { runner, timers, onChange } = makeRunner(distractorState(0));

    timers[0].fn();
    runner.probe("recall");

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ phase: "awaiting_probe" }),
      { type: "wait_elapsed", at: 0 },
    );
    expect(onChange).toHaveBeenNthCalledWith(2, runner.state, {
      type: "probe_result",
      outcome: "recall",
      at: 0,
    });
  });

  it("dispose cancels pending timers; a dispatch after dispose is a silent no-op", () => {
    const { runner, timers, onChange } = makeRunner(distractorState(0));

    runner.dispose();

    expect(timers[0].cancelled).toBe(true);
    expect(runner.currentWait).toBeNull();

    const stateBefore = runner.state;
    runner.probe("recall");

    expect(runner.state).toBe(stateBefore);
    expect(onChange).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1); // no new timer scheduled post-dispose
  });

  it("a terminal ended state never schedules a timer at construction", () => {
    const endedState: SessionState = { ...distractorState(0), phase: "ended" };
    const { runner, timers } = makeRunner(endedState);

    expect(timers).toHaveLength(0);
    expect(runner.currentWait).toBeNull();
  });
});

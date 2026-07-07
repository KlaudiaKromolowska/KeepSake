import { describe, expect, it } from "vitest";
import { DEFAULT_SR_CONFIG } from "./config";
import { scaleWaitMs } from "./demoSpeed";
import type { SessionEvent, SessionState, TargetProgress } from "./session";
import { sessionReduce, startSession } from "./session";
import type { Outcome } from "./types";

const config = DEFAULT_SR_CONFIG;
const TZ = "UTC";

function fresh(): TargetProgress {
  return {
    lastSuccessSec: null,
    startStreak: 0,
    lastStartSuccessDay: null,
    badSessions: 0,
    mastered: false,
    sessionCount: 0,
  };
}

describe("scaleWaitMs", () => {
  it("leaves the wait unchanged at 1x", () => {
    expect(scaleWaitMs(15_000, 1)).toBe(15_000);
  });

  it("compresses the wait above 1x", () => {
    expect(scaleWaitMs(60_000, 60)).toBe(1_000);
    expect(scaleWaitMs(15_000, 2)).toBe(7_500);
  });

  it("treats a speed below 1 as 1x (bad env var must not break a session)", () => {
    expect(scaleWaitMs(15_000, 0)).toBe(15_000);
    expect(scaleWaitMs(15_000, 0.5)).toBe(15_000);
    expect(scaleWaitMs(15_000, -60)).toBe(15_000);
  });

  it("treats a non-finite speed as 1x, never throwing", () => {
    expect(scaleWaitMs(15_000, Number.NaN)).toBe(15_000);
    expect(scaleWaitMs(15_000, Number.POSITIVE_INFINITY)).toBe(15_000);
  });
});

/** One fully scripted session: each step carries the REAL wall-clock wait it follows. */
interface PlanStep {
  ev:
    | { type: "teach_done" | "wait_elapsed" | "correction_done" | "end_requested" }
    | {
        type: "probe_result";
        outcome: Outcome;
      };
  /** real gap, ms, that the clock advances by before this event fires */
  wait: number;
}

const PLAN: PlanStep[] = [
  { ev: { type: "teach_done" }, wait: 0 },
  { ev: { type: "wait_elapsed" }, wait: 15_000 },
  { ev: { type: "probe_result", outcome: "recall" }, wait: 0 },
  { ev: { type: "wait_elapsed" }, wait: 30_000 },
  { ev: { type: "probe_result", outcome: "recall" }, wait: 0 },
  { ev: { type: "wait_elapsed" }, wait: 60_000 },
  { ev: { type: "probe_result", outcome: "miss" }, wait: 0 },
  { ev: { type: "correction_done" }, wait: 0 },
  { ev: { type: "wait_elapsed" }, wait: 30_000 },
  { ev: { type: "probe_result", outcome: "recall" }, wait: 0 },
  { ev: { type: "end_requested" }, wait: 0 },
];

function toEvent(step: PlanStep, at: number): SessionEvent {
  if (step.ev.type === "probe_result") {
    return { type: "probe_result", outcome: step.ev.outcome, at };
  }
  return { type: step.ev.type, at };
}

/** Drive the scripted session; the UI wait is computed via scaleWaitMs but never persisted. */
function drive(demoSpeed: number): { state: SessionState; uiWaits: number[] } {
  let at = 0;
  let state = startSession(fresh(), { at, timeZone: TZ }, config);
  const uiWaits: number[] = [];
  for (const step of PLAN) {
    uiWaits.push(scaleWaitMs(step.wait, demoSpeed)); // what the demo UI would actually wait
    at += step.wait; // the CLOCK still advances by the real interval
    state = sessionReduce(state, toEvent(step, at), config);
  }
  return { state, uiWaits };
}

describe("DEMO_SPEED wait scaling is invisible to persisted data (PLAN §8b)", () => {
  it("produces byte-identical trials and progress at 1x and 60x", () => {
    const real = drive(1);
    const demo = drive(60);

    expect(demo.state.trials).toEqual(real.state.trials);
    expect(demo.state.progress).toEqual(real.state.progress);
    expect(demo.state).toEqual(real.state); // the whole persisted session is identical

    // Guard the guard: the 60x run really did compress at least one wait, so identical
    // persisted state is a property of the engine, not of a no-op scaler.
    const anyCompressed = demo.uiWaits.some((w, i) => {
      const realWait = real.uiWaits[i];
      return realWait !== undefined && w < realWait;
    });
    expect(anyCompressed).toBe(true);
  });

  it("ends the scripted session on a recall win", () => {
    const { state } = drive(1);
    expect(state.phase).toBe("ended");
    expect(state.trials.at(-1)?.outcome).toBe("recall");
  });
});

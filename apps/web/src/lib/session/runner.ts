import {
  type Outcome,
  type SessionEvent,
  type SessionState,
  type SrConfig,
  sessionReduce,
} from "@keepsake/core/sr";
import { demoWaitMs } from "./wait-policy";

export interface RunnerDeps {
  now(): number;
  setTimer(ms: number, fn: () => void): () => void; // returns a cancel function
  demoSpeed: number;
  config: SrConfig;
  onChange(state: SessionState, event: SessionEvent): void;
}

export interface CurrentWait {
  startedAtMs: number;
  durationMs: number;
  intervalSec: number;
}

/**
 * The ONLY place wall-clock timers live (PLAN §8b): dispatches engine events with injected
 * timestamps and schedules the distractor wait through the `demoWaitMs` compression profile.
 * `sessionReduce` is pure — this class owns nothing but the current state + one pending timer.
 */
export class SessionRunner {
  state: SessionState;
  currentWait: CurrentWait | null = null;

  private cancelPending: (() => void) | null = null;
  private disposed = false;

  constructor(
    initial: SessionState,
    private readonly deps: RunnerDeps,
  ) {
    this.state = initial;
    this.reconcile();
  }

  probe(outcome: Outcome): void {
    this.dispatch({ type: "probe_result", outcome, at: this.deps.now() });
  }

  teachDone(): void {
    this.dispatch({ type: "teach_done", at: this.deps.now() });
  }

  correctionDone(): void {
    this.dispatch({ type: "correction_done", at: this.deps.now() });
  }

  endRequested(): void {
    this.dispatch({ type: "end_requested", at: this.deps.now() });
  }

  overrideInterval(intervalSec: number): void {
    this.dispatch({ type: "interval_override", intervalSec, at: this.deps.now() });
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPending?.();
    this.cancelPending = null;
    this.currentWait = null;
  }

  private dispatch(event: SessionEvent): void {
    if (this.disposed) return;
    const next = sessionReduce(this.state, event, this.deps.config);
    const changed = next !== this.state;
    this.state = next;
    this.deps.onChange(next, event);
    // Identity no-ops (out-of-phase events) must not restart a running timer.
    if (changed) this.reconcile();
  }

  private reconcile(): void {
    this.cancelPending?.();
    this.cancelPending = null;
    this.currentWait = null;
    if (this.state.phase !== "distractor") return;

    const intervalSec = this.state.intervalSec;
    const durationMs = demoWaitMs(intervalSec, this.deps.demoSpeed);
    const startedAtMs = this.deps.now();
    this.cancelPending = this.deps.setTimer(durationMs, () =>
      this.dispatch({ type: "wait_elapsed", at: this.deps.now() }),
    );
    this.currentWait = { startedAtMs, durationMs, intervalSec };
  }
}

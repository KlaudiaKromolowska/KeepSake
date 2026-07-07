import type { SrConfig } from "./config";
import { calendarDayInTz } from "./dates";
import { isAtCeiling, nextIntervalSec, resetIntervalSec } from "./ladder";
import type { Outcome, TrialRecord } from "./types";

export type SessionPhase =
  | "teach" // session 1 opener: device shows answer, patient repeats at 0s
  | "distractor" // waiting out `intervalSec` with filler activity
  | "awaiting_probe" // probe on screen, caregiver will tap recall|miss|unclear
  | "correcting" // device shows the answer after a confirmed miss; patient repeats
  | "end_on_win" // closing guaranteed 0s success: answer shown, patient repeats
  | "ended";

/**
 * Cross-session per-target state (persisted as the target_state row).
 * `lastStartSuccessDay` and `sessionCount` have no column in the PLAN §8 target_state sketch —
 * Phase 2 must add them (persistence gap; the engine, not the schema, is authoritative for now).
 */
export interface TargetProgress {
  lastSuccessSec: number | null;
  startStreak: number;
  lastStartSuccessDay: string | null; // "YYYY-MM-DD" in the patient's timezone
  badSessions: number;
  mastered: boolean;
  sessionCount: number; // completed-or-started sessions before this one
}

export interface SessionState {
  phase: SessionPhase;
  intervalSec: number;
  baseMisses: number;
  unclearRun: number;
  startedAt: number; // epoch ms of startSession
  startedDay: string; // calendar day of startedAt in timeZone
  timeZone: string;
  isStartProbe: boolean; // next probe_result is the session-start mastery datapoint
  progress: TargetProgress; // updated copy — never mutate the input
  trials: TrialRecord[];
  endReason: "ceiling" | "struggle" | "caregiver" | "mastered" | null;
  /** §5 between-session scheduler takes over when true (ceiling reached or mastered). */
  handoffToScheduler: boolean;
  /** 3 consecutive bad sessions → pause target, prompt caregiver to re-scope (never silent). */
  rescopeRequired: boolean;
}

export type SessionEvent =
  | { type: "teach_done"; at: number } // patient repeated the answer (teach / end_on_win)
  | { type: "wait_elapsed"; at: number } // distractor gap finished
  | { type: "probe_result"; outcome: Outcome; at: number }
  | { type: "correction_done"; at: number } // patient repeated the answer after correction
  | { type: "end_requested"; at: number }; // caregiver closes the session

export function startSession(
  progress: TargetProgress,
  opts: { at: number; timeZone: string },
  // biome-ignore lint/correctness/noUnusedFunctionParameters: reserved for signature stability
  config: SrConfig,
): SessionState {
  const isFirstSession = progress.sessionCount === 0;
  const base: SessionState = {
    phase: isFirstSession ? "teach" : "awaiting_probe",
    intervalSec: 0, // teach + start probe are both 0-delay
    baseMisses: 0,
    unclearRun: 0,
    startedAt: opts.at,
    startedDay: calendarDayInTz(opts.at, opts.timeZone),
    timeZone: opts.timeZone,
    isStartProbe: !isFirstSession,
    progress: { ...progress, sessionCount: progress.sessionCount + 1 },
    trials: [],
    endReason: null,
    handoffToScheduler: false,
    rescopeRequired: false,
  };
  return base;
}

/** Same-day resume gate (PLAN §4.2: resumable same-day, else discard gracefully — no penalty). */
export function canResume(state: SessionState, at: number): boolean {
  return state.phase !== "ended" && calendarDayInTz(at, state.timeZone) === state.startedDay;
}

/** Re-enter an interrupted session at the last-success rung. Returns null when not resumable. */
export function resumeSession(
  state: SessionState,
  at: number,
  config: SrConfig,
): SessionState | null {
  if (!canResume(state, at)) return null;
  return {
    ...state,
    phase: "distractor",
    intervalSec: resetIntervalSec(state.progress.lastSuccessSec, config),
    unclearRun: 0,
    isStartProbe: false, // re-enter as a normal trial rung, never the 0s start probe
  };
}

function trial(intervalSec: number, outcome: Outcome, corrected: boolean, at: number): TrialRecord {
  return { intervalSec, outcome, corrected, isScreening: false, at };
}

/**
 * True when the last logged trial was anything other than a recall — a confirmed miss, or an
 * unclear (converted, or still below the unclear cap). A session may only close directly to
 * "ended" on a last-trial recall, or with zero trials; any other last trial owes a win.
 */
function lastTrialNotRecall(trials: readonly TrialRecord[]): boolean {
  const last = trials[trials.length - 1];
  return last !== undefined && last.outcome !== "recall";
}

/**
 * Single point of soft-cap / caregiver-close routing: closes on a win unless the last logged
 * trial was a recall (or there were no trials at all). Sessions never end on failure — or on an
 * ambiguous unclear. All soft-cap branches in `handleTrialProbe` delegate here so this routing
 * rule lives in exactly one place.
 */
function closeSession(next: SessionState, endReason: "caregiver"): SessionState {
  if (lastTrialNotRecall(next.trials)) return { ...next, phase: "end_on_win", endReason };
  return { ...next, phase: "ended", endReason };
}

export function sessionReduce(
  state: SessionState,
  event: SessionEvent,
  config: SrConfig,
): SessionState {
  if (state.phase === "ended") return state; // terminal: stray taps are no-ops

  switch (event.type) {
    case "teach_done":
      return handleTeachDone(state, event.at, config);
    case "wait_elapsed":
      return handleWaitElapsed(state, event.at, config);
    case "correction_done":
      return handleCorrectionDone(state, config);
    case "probe_result":
      return handleProbe(state, event.outcome, event.at, config);
    case "end_requested":
      return handleEndRequested(state);
  }
}

function handleTeachDone(state: SessionState, at: number, config: SrConfig): SessionState {
  if (state.phase === "teach") {
    // Assisted 0s success: the device showed the answer and the patient repeated it.
    return {
      ...state,
      phase: "distractor",
      intervalSec: state.progress.lastSuccessSec ?? config.baseIntervalSec,
      trials: [...state.trials, trial(0, "recall", true, at)],
    };
  }
  if (state.phase === "end_on_win") {
    return {
      ...state,
      phase: "ended",
      trials: [...state.trials, trial(0, "recall", true, at)],
    };
  }
  return state;
}

function handleWaitElapsed(state: SessionState, at: number, config: SrConfig): SessionState {
  if (state.phase !== "distractor") return state;
  if (softCapReached(state, at, config)) return closeSession(state, "caregiver");
  return { ...state, phase: "awaiting_probe" };
}

function handleCorrectionDone(state: SessionState, config: SrConfig): SessionState {
  if (state.phase !== "correcting") return state;
  const intervalSec = resetIntervalSec(state.progress.lastSuccessSec, config);
  if (intervalSec > config.baseIntervalSec) {
    return { ...state, phase: "distractor", intervalSec };
  }
  // Reverted to the base floor → count a base miss; enough of them end the session.
  const baseMisses = state.baseMisses + 1;
  if (baseMisses < config.baseMissesToEnd) {
    return { ...state, phase: "distractor", intervalSec, baseMisses };
  }
  const badSessions = state.progress.badSessions + 1;
  return {
    ...state,
    phase: "end_on_win",
    intervalSec,
    baseMisses,
    endReason: "struggle",
    progress: { ...state.progress, badSessions },
    rescopeRequired: badSessions >= config.badSessionsToRescope,
  };
}

function handleProbe(
  state: SessionState,
  outcome: Outcome,
  at: number,
  config: SrConfig,
): SessionState {
  if (state.phase !== "awaiting_probe") return state;
  if (state.isStartProbe) return handleStartProbe(state, outcome, at, config);
  return handleTrialProbe(state, outcome, at, config);
}

function handleStartProbe(
  state: SessionState,
  outcome: Outcome,
  at: number,
  config: SrConfig,
): SessionState {
  // 0-delay mastery datapoint. Never updates lastSuccessSec (not a real rung).
  if (outcome === "unclear") {
    const unclearRun = state.unclearRun + 1;
    if (unclearRun < config.unclearCap) {
      // Re-probe the start question at 0s after a fresh distractor gap.
      return {
        ...state,
        phase: "distractor",
        unclearRun,
        trials: [...state.trials, trial(0, "unclear", false, at)],
      };
    }
    // Two unclears → confirmed miss: reset streak, enter correction.
    return {
      ...startProbeMiss(state),
      trials: [...state.trials, trial(0, "unclear", true, at)],
    };
  }

  if (outcome === "miss") {
    return {
      ...startProbeMiss(state),
      trials: [...state.trials, trial(0, "miss", true, at)],
    };
  }

  // recall — advance the streak only across distinct calendar days.
  const day = calendarDayInTz(at, state.timeZone);
  const priorDay = state.progress.lastStartSuccessDay;
  const distinctDay = priorDay === null || priorDay !== day;
  const startStreak = distinctDay ? state.progress.startStreak + 1 : state.progress.startStreak;
  const progress: TargetProgress = {
    ...state.progress,
    startStreak,
    lastStartSuccessDay: distinctDay ? day : priorDay,
  };
  const trials = [...state.trials, trial(0, "recall", false, at)];

  if (startStreak >= config.masteryStreak) {
    return {
      ...state,
      phase: "ended",
      isStartProbe: false,
      endReason: "mastered",
      handoffToScheduler: true,
      progress: { ...progress, mastered: true },
      trials,
    };
  }
  return {
    ...state,
    phase: "distractor",
    isStartProbe: false,
    unclearRun: 0,
    intervalSec: progress.lastSuccessSec ?? config.baseIntervalSec,
    progress,
    trials,
  };
}

/** Streak-reset + correction routing shared by a start-probe miss and unclear-run conversion. */
function startProbeMiss(state: SessionState): SessionState {
  return {
    ...state,
    phase: "correcting",
    isStartProbe: false,
    unclearRun: 0,
    progress: { ...state.progress, startStreak: 0 },
  };
}

function handleTrialProbe(
  state: SessionState,
  outcome: Outcome,
  at: number,
  config: SrConfig,
): SessionState {
  const softCap = softCapReached(state, at, config);
  const { intervalSec } = state;

  if (outcome === "unclear") {
    const unclearRun = state.unclearRun + 1;
    if (unclearRun < config.unclearCap) {
      const next: SessionState = {
        ...state,
        unclearRun,
        trials: [...state.trials, trial(intervalSec, "unclear", false, at)],
      };
      // Unclear is neither success nor failure, but it didn't move the ladder either — a
      // soft-cap close here still owes a win (delegated to closeSession).
      if (softCap) return closeSession(next, "caregiver");
      return { ...next, phase: "distractor" }; // re-probe the same rung
    }
    const next: SessionState = {
      ...state,
      unclearRun: 0,
      trials: [...state.trials, trial(intervalSec, "unclear", true, at)],
    };
    if (softCap) return closeSession(next, "caregiver");
    return { ...next, phase: "correcting" };
  }

  if (outcome === "recall") {
    const next: SessionState = {
      ...state,
      baseMisses: 0,
      unclearRun: 0,
      progress: { ...state.progress, lastSuccessSec: intervalSec },
      trials: [...state.trials, trial(intervalSec, "recall", false, at)],
    };
    if (isAtCeiling(intervalSec, config)) {
      return { ...next, phase: "ended", endReason: "ceiling", handoffToScheduler: true };
    }
    if (softCap) return closeSession(next, "caregiver");
    return { ...next, phase: "distractor", intervalSec: nextIntervalSec(intervalSec, config) };
  }

  // confirmed miss → errorless correction (device-delivered)
  const next: SessionState = {
    ...state,
    unclearRun: 0,
    trials: [...state.trials, trial(intervalSec, "miss", true, at)],
  };
  if (softCap) return closeSession(next, "caregiver");
  return { ...next, phase: "correcting" };
}

function handleEndRequested(state: SessionState): SessionState {
  if (state.phase === "end_on_win") return state; // already closing on a win
  // Mid-correction, or the last logged trial wasn't a recall → still close on a win.
  if (state.phase === "correcting" || lastTrialNotRecall(state.trials)) {
    return { ...state, phase: "end_on_win", endReason: "caregiver" };
  }
  return { ...state, phase: "ended", endReason: "caregiver" };
}

function softCapReached(state: SessionState, at: number, config: SrConfig): boolean {
  return at - state.startedAt >= config.sessionSoftCapSec * 1000;
}

// In-silico population simulation harness — drives the real `packages/core/src/sr` reducers with
// a virtual clock and a synthetic memory model (memoryModel.ts). No engine semantics are changed
// or duplicated here: every state transition is produced by calling `candidacyReduce`/
// `sessionReduce`/the scheduler functions exactly as the app does. See docs/simulation/README.md
// for the full method write-up and honest limitations.

import type { CandidacyState } from "../sr/candidacy";
import { candidacyReduce, currentLevelSec, initialCandidacyState } from "../sr/candidacy";
import type { SrConfig } from "../sr/config";
import { defaultsForEtiology } from "../sr/etiology";
import type { ScheduleState } from "../sr/scheduler";
import {
  afterCeilingHandoff,
  afterMastery,
  onBoosterOutcome,
  onSessionStartOutcome,
} from "../sr/scheduler";
import type { SessionState, TargetProgress } from "../sr/session";
import { resolvedStartProbeOutcome, sessionReduce, startSession } from "../sr/session";
import type { Etiology, Outcome } from "../sr/types";
import type { MemoryState } from "./memoryModel";
import {
  drawOutcome,
  growAfterCorrection,
  growAfterSuccess,
  initialStrengthSec,
  shrinkAfterFailure,
} from "./memoryModel";
import type { SyntheticPatient } from "./patient";
import { samplePatient } from "./patient";
import type { Rng } from "./rng";
import { createRng } from "./rng";

const DAY_MS = 86_400_000;
const TIME_ZONE = "UTC";
/** Safety valve only — over a 90-day horizon the real cadence never gets close to this (daily
 *  acquisition sessions plus at most ~13 boosters at the 7-day floor). A real run hitting this
 *  indicates a non-terminating loop, not a plausible patient trajectory. */
const MAX_SESSIONS = 500;
/** Safety valve for a single session's reducer loop (teach/distractor/probe/correct cycles). */
const MAX_SESSION_ITERATIONS = 5000;

export interface BoosterCheck {
  atMs: number;
  mode: ScheduleState["mode"];
  outcome: Outcome;
  /** Real elapsed days since the item's last exposure — the actual retention gap this check
   *  tested (may differ slightly from the nominal cadence step). */
  gapDaysTested: number;
}

export type PatientStatus = "not_candidate" | "acquiring" | "mastered" | "rescoped";

export interface PatientSimResult {
  patientId: number;
  etiology: Etiology;
  ability: number;
  candidacyPassed: boolean;
  /** Index of the highest candidacy level reached (0 = only the 0s level attempted); equals
   *  `config.candidacyLevelsSec.length` when the screen was passed outright. */
  candidacyLevelReached: number;
  status: PatientStatus;
  /** `progress.sessionCount` at the moment mastery was first reached; null if never mastered. */
  sessionsToMastery: number | null;
  /** Simulated days from candidacy completion to first mastery; null if never mastered. */
  daysToMastery: number | null;
  masteredAtMs: number | null;
  /** Total sessions simulated for this patient (acquisition + boosters), within the horizon. */
  sessionCount: number;
  /** Every non-screening, non-zero within-session trial interval encountered (seconds). */
  trialIntervalsSec: number[];
  /** Every between-session / booster session-start probe outcome, in order. */
  boosterChecks: BoosterCheck[];
}

/** Runs the Brush & Camp candidacy screen against the synthetic memory model. */
function runCandidacyScreen(
  memory: MemoryState,
  rng: Rng,
  config: SrConfig,
): { state: CandidacyState; levelReached: number } {
  let state = initialCandidacyState();
  let at = 0;
  while (state.status === "in_progress") {
    const levelSec = currentLevelSec(state, config);
    if (levelSec === null) break; // unreachable: status === "in_progress" guarantees a level
    const outcome = drawOutcome(rng, memory, levelSec);
    state = candidacyReduce(state, { type: "probe_result", outcome, at }, config);
    if (state.correctionRequired) {
      at += 1_000;
      state = candidacyReduce(state, { type: "correction_done", at }, config);
    }
    at += 1_000;
  }
  const levelReached =
    state.status === "passed" ? config.candidacyLevelsSec.length : state.levelIndex;
  return { state, levelReached };
}

export interface MemoryRef {
  memory: MemoryState;
  /** epoch ms of the last time the patient was shown or successfully recalled the target. */
  lastExposureAtMs: number;
}

export interface SessionDriveResult {
  session: SessionState;
  /** The session-start probe outcome, when this session had one (every session but the first). */
  startProbeOutcome: Outcome | null;
  /** Real elapsed seconds since last exposure the start probe tested — null when there was none. */
  startProbeElapsedSec: number | null;
  trialIntervalsSec: number[];
}

/** Drives one session's reducer loop end-to-end (teach/distractor/probe/correction cycles),
 *  feeding each probe through the synthetic memory model and updating it on recall/miss. */
export function driveSession(
  initial: SessionState,
  config: SrConfig,
  memoryRef: MemoryRef,
  ability: number,
  rng: Rng,
): SessionDriveResult {
  let state = initial;
  let at = initial.startedAt;
  let startProbeElapsedSec: number | null = null;
  const trialIntervalsSec: number[] = [];
  let iterations = 0;

  while (state.phase !== "ended") {
    if (++iterations > MAX_SESSION_ITERATIONS) {
      throw new Error(
        `driveSession: exceeded ${MAX_SESSION_ITERATIONS} iterations — likely a non-terminating loop`,
      );
    }
    switch (state.phase) {
      case "teach":
        // Mechanically identical to a correction ("device shows the answer, patient repeats" —
        // session.ts's own docstring for both "teach" and "correcting"), so it gets the same
        // assisted-exposure consolidation.
        state = sessionReduce(state, { type: "teach_done", at }, config);
        memoryRef.memory = growAfterCorrection(memoryRef.memory, ability);
        memoryRef.lastExposureAtMs = at;
        break;
      case "distractor":
        at += state.intervalSec * 1_000;
        state = sessionReduce(state, { type: "wait_elapsed", at }, config);
        break;
      case "awaiting_probe": {
        const elapsedSec = Math.max(0, (at - memoryRef.lastExposureAtMs) / 1_000);
        const outcome = drawOutcome(rng, memoryRef.memory, elapsedSec);
        if (state.isStartProbe) {
          startProbeElapsedSec = elapsedSec;
        } else if (state.intervalSec > 0) {
          trialIntervalsSec.push(state.intervalSec);
        }
        state = sessionReduce(state, { type: "probe_result", outcome, at }, config);
        if (outcome === "recall") {
          memoryRef.memory = growAfterSuccess(memoryRef.memory, elapsedSec, ability);
          memoryRef.lastExposureAtMs = at;
        } else if (outcome === "miss") {
          memoryRef.memory = shrinkAfterFailure(memoryRef.memory, ability);
        }
        // "unclear": no memory-state change — mirrors the engine's "unclear never moves the ladder".
        break;
      }
      case "correcting":
        state = sessionReduce(state, { type: "correction_done", at }, config);
        memoryRef.memory = growAfterCorrection(memoryRef.memory, ability);
        memoryRef.lastExposureAtMs = at;
        break;
      case "end_on_win":
        // Same assisted-exposure mechanic as "teach" (guaranteed closing win).
        state = sessionReduce(state, { type: "teach_done", at }, config);
        memoryRef.memory = growAfterCorrection(memoryRef.memory, ability);
        memoryRef.lastExposureAtMs = at;
        break;
    }
  }
  // Resolved from the final trial log (not tracked live per-draw): a terminal double-unclear
  // must surface as "miss" to the scheduler dispatch below, same as the real app's endSessionAction
  // — reusing the identical core rule keeps the sim from silently biasing schedule-shrink/
  // time-to-mastery conclusions on that path. See resolvedStartProbeOutcome's docstring.
  const startProbeOutcome = resolvedStartProbeOutcome(state.trials);
  return { session: state, startProbeOutcome, startProbeElapsedSec, trialIntervalsSec };
}

/**
 * Drives one synthetic patient through candidacy, acquisition, mastery and maintenance/boosters
 * over `horizonDays`. Pre-schedule (before the within-session ceiling or mastery is first
 * reached), sessions run once per calendar day — a product/orchestration cadence choice, not an
 * engine rule (the engine itself is silent on inter-session timing until a schedule exists).
 * Once a `ScheduleState` exists, subsequent sessions are driven at `schedule.nextDueAt`, per the
 * integration contract documented in `scheduler.ts`.
 */
export function simulatePatient(
  patient: SyntheticPatient,
  rng: Rng,
  config: SrConfig,
  horizonDays: number,
): PatientSimResult {
  const horizonMs = horizonDays * DAY_MS;
  const memory0 = initialStrengthSec(patient.ability, patient.etiology);
  const { state: candidacy, levelReached } = runCandidacyScreen(memory0, rng, config);

  if (candidacy.status !== "passed") {
    return {
      patientId: patient.id,
      etiology: patient.etiology,
      ability: patient.ability,
      candidacyPassed: false,
      candidacyLevelReached: levelReached,
      status: "not_candidate",
      sessionsToMastery: null,
      daysToMastery: null,
      masteredAtMs: null,
      sessionCount: 0,
      trialIntervalsSec: [],
      boosterChecks: [],
    };
  }

  let progress: TargetProgress = {
    lastSuccessSec: null,
    startStreak: 0,
    lastStartSuccessDay: null,
    badSessions: 0,
    mastered: false,
    sessionCount: 0,
  };
  const memoryRef: MemoryRef = { memory: memory0, lastExposureAtMs: 0 };
  let schedule: ScheduleState | null = null;
  const trialIntervalsSec: number[] = [];
  const boosterChecks: BoosterCheck[] = [];
  let masteredAtMs: number | null = null;
  let sessionsToMastery: number | null = null;
  let rescoped = false;
  let sessionIndex = 0;

  while (sessionIndex < MAX_SESSIONS) {
    const sessionAt = schedule ? schedule.nextDueAt : sessionIndex * DAY_MS;
    if (sessionAt > horizonMs) break;

    const started = startSession(progress, { at: sessionAt, timeZone: TIME_ZONE }, config);
    const driven = driveSession(started, config, memoryRef, patient.ability, rng);
    const { session, startProbeOutcome, startProbeElapsedSec } = driven;
    progress = session.progress;
    trialIntervalsSec.push(...driven.trialIntervalsSec);
    sessionIndex += 1;

    // Feed the SAME start-probe outcome to the scheduler, per the scheduler.ts integration
    // contract — dispatched on the existing schedule's mode (onSessionStartOutcome pre-mastery,
    // onBoosterOutcome post-mastery).
    if (schedule && startProbeOutcome) {
      boosterChecks.push({
        atMs: sessionAt,
        mode: schedule.mode,
        outcome: startProbeOutcome,
        gapDaysTested: (startProbeElapsedSec ?? 0) / (DAY_MS / 1_000),
      });
      const outcomeFn: typeof onSessionStartOutcome =
        schedule.mode === "between" ? onSessionStartOutcome : onBoosterOutcome;
      const result: ReturnType<typeof onSessionStartOutcome> = outcomeFn(
        schedule,
        startProbeOutcome,
        sessionAt,
        config,
      );
      // On the mastering recall the scheduler's between/booster-mode result is DISCARDED and
      // afterMastery is called instead (handled below) — otherwise adopt it.
      if (session.endReason !== "mastered") schedule = result.state;
    }

    if (session.handoffToScheduler) {
      if (session.endReason === "mastered") {
        schedule = afterMastery(sessionAt, config);
        if (masteredAtMs === null) {
          masteredAtMs = sessionAt;
          sessionsToMastery = progress.sessionCount;
        }
      } else if (session.endReason === "ceiling" && !schedule) {
        // Only initialize on first entry — an existing schedule (re-reached ceiling after a
        // reopened within-session retrain) keeps its already-updated state, never re-initialized.
        schedule = afterCeilingHandoff(sessionAt, config);
      }
    }

    if (session.rescopeRequired) {
      rescoped = true;
      break;
    }
  }

  const status: PatientStatus = rescoped
    ? "rescoped"
    : masteredAtMs !== null
      ? "mastered"
      : "acquiring";

  return {
    patientId: patient.id,
    etiology: patient.etiology,
    ability: patient.ability,
    candidacyPassed: true,
    candidacyLevelReached: levelReached,
    status,
    sessionsToMastery,
    daysToMastery: masteredAtMs !== null ? masteredAtMs / DAY_MS : null,
    masteredAtMs,
    sessionCount: progress.sessionCount,
    trialIntervalsSec,
    boosterChecks,
  };
}

export interface PopulationSimOptions {
  n: number;
  seed: number;
  /** Simulated horizon in days from candidacy completion. Defaults to 90 (the spec's window). */
  horizonDays?: number;
}

/**
 * Simulates a population of `n` synthetic patients from a single seeded RNG stream, consumed
 * sequentially (patient sampling, then that patient's full protocol run, then the next patient).
 * This — not per-patient parallelism — is what makes the whole run reproducible from one seed.
 */
export function simulatePopulation(opts: PopulationSimOptions): PatientSimResult[] {
  const horizonDays = opts.horizonDays ?? 90;
  const rng = createRng(opts.seed);
  const results: PatientSimResult[] = [];
  for (let id = 0; id < opts.n; id++) {
    const patient = samplePatient(rng, id);
    const { config } = defaultsForEtiology(patient.etiology);
    results.push(simulatePatient(patient, rng, config, horizonDays));
  }
  return results;
}

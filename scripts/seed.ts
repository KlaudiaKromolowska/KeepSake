// Demo seed: persona "Marta", target "Lena", ~14 days of engine-generated pre-run trial history
// (Revised_plan.md Day-3 Track A) — acquisition (ladder climb, misses/resets) -> mastery on 3
// distinct calendar days -> maintenance with one booster dip + recovery. Every trials/target_state
// value traces to real @keepsake/core output — nothing here is a hand-written row. Idempotent:
// re-running wipes and recreates the demo graph.
//
// Usage: `pnpm seed` against the local Supabase stack (`supabase start`).
// Safety: refuses to run against a non-local URL unless --allow-remote is passed.
import { execSync } from "node:child_process";
import {
  afterCeilingHandoff,
  afterMastery,
  type CandidacyState,
  candidacyReduce,
  defaultsForEtiology,
  initialCandidacyState,
  type Outcome,
  onBoosterOutcome,
  onSessionStartOutcome,
  resetIntervalSec,
  type ScheduleState,
  type SessionState,
  sessionReduce,
  startSession,
  type TargetProgress,
  type TrialRecord,
} from "@keepsake/core/sr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEMO_EMAIL = "demo@keepsake.test";
const PATIENT_TZ = "Europe/Warsaw";
const { config, answerFormat } = defaultsForEtiology("alzheimers"); // growthFactor 1.5, not 2 (see report)

// Fixed, cycling deterministic values — never Math.random (CLAUDE.md: seed must be reproducible).
const REACTION_LATENCIES_MS = [2000, 3000, 4000, 2500];
const UI_LATENCIES_MS = [1200, 1800, 2500, 900];
function cyclic(values: number[], i: number): number {
  return values[i % values.length] as number;
}

/** Two-tap patient affect (5.4) per seeded session — a fixed, plausible mix (never all-content),
 *  so the RCT report's `get_affect_summary` tool has both buckets to describe. Unsettled around
 *  the miss-heavy sessions (day −12 reconfirm, day −11 start-probe miss, the booster dip);
 *  content everywhere else, including the mastery and recovery sessions. */
const AFFECT = {
  s1: { affectPre: "content", affectPost: "content" },
  s2: { affectPre: "content", affectPost: "content" },
  s3: { affectPre: "unsettled", affectPost: "content" },
  s4: { affectPre: "content", affectPost: "unsettled" },
  s5: { affectPre: "content", affectPost: "content" },
  s6: { affectPre: "content", affectPost: "content" },
  s7: { affectPre: "content", affectPost: "content" },
  boosterA: { affectPre: "content", affectPost: "content" },
  boosterB: { affectPre: "unsettled", affectPost: "content" },
  boosterC: { affectPre: "content", affectPost: "content" },
} as const satisfies Record<
  string,
  { affectPre: "content" | "unsettled"; affectPost: "content" | "unsettled" }
>;

// --- env resolution (mirrors packages/db-tests/src/rls-denial.test.ts) ----------------------

function resolveEnv(): { url: string; anonKey: string; serviceRoleKey: string } {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const notRunning =
    "local Supabase stack not running — start it with `supabase start`, or set " +
    "SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.";
  let output: string;
  try {
    output = execSync("supabase status -o env", { encoding: "utf-8" });
  } catch {
    throw new Error(notRunning);
  }
  const vars = Object.fromEntries(
    [...output.matchAll(/^([A-Z_]+)="(.*)"$/gm)].map(([, key, value]) => [key, value]),
  );
  const url = vars.API_URL;
  const anonKey = vars.ANON_KEY;
  const serviceRoleKey = vars.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceRoleKey) throw new Error(notRunning);
  return { url, anonKey, serviceRoleKey };
}

function assertLocal(url: string, allowRemote: boolean): void {
  const hostname = new URL(url).hostname;
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  if (isLocal || allowRemote) return;
  console.error(
    `refusing to seed ${url} — not a local Supabase URL. Pass --allow-remote to override ` +
      "(deliberate later step, never accidental).",
  );
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see .env.example)`);
  return value;
}

// --- timezone-aware timestamp helpers (orchestration boundary — core stays pure) -------------

/** Epoch ms for `hh:mm` local wall-clock time on `dateStr` ("YYYY-MM-DD") in `timeZone`. */
function zonedTimeMs(dateStr: string, hh: number, mm: number, timeZone: string): number {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24; // Intl may render midnight as "24"
  const shownAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second),
  );
  return guess + (guess - shownAsUtc);
}

function dateNDaysAgo(n: number, timeZone: string): string {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  const [y, m, d] = todayStr.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(y, m - 1, d));
  shifted.setUTCDate(shifted.getUTCDate() - n);
  return shifted.toISOString().slice(0, 10);
}

// --- session-driving helpers (thin wrappers over the real reducers) --------------------------

function wait(cursor: number, state: SessionState): { at: number; state: SessionState } {
  if (state.phase !== "distractor") throw new Error(`expected distractor, got ${state.phase}`);
  const at = cursor + state.intervalSec * 1000;
  return { at, state: sessionReduce(state, { type: "wait_elapsed", at }, config) };
}

function probe(
  cursor: number,
  state: SessionState,
  outcome: "recall" | "miss" | "unclear",
  latencyIdx: number,
): { at: number; state: SessionState } {
  if (state.phase !== "awaiting_probe")
    throw new Error(`expected awaiting_probe, got ${state.phase}`);
  const at = cursor + cyclic(REACTION_LATENCIES_MS, latencyIdx);
  return { at, state: sessionReduce(state, { type: "probe_result", outcome, at }, config) };
}

function teach(
  cursor: number,
  state: SessionState,
  latencyIdx: number,
): { at: number; state: SessionState } {
  if (state.phase !== "teach") throw new Error(`expected teach, got ${state.phase}`);
  const at = cursor + cyclic(REACTION_LATENCIES_MS, latencyIdx);
  return { at, state: sessionReduce(state, { type: "teach_done", at }, config) };
}

function correct(
  cursor: number,
  state: SessionState,
  latencyIdx: number,
): { at: number; state: SessionState } {
  if (state.phase !== "correcting") throw new Error(`expected correcting, got ${state.phase}`);
  const at = cursor + cyclic(REACTION_LATENCIES_MS, latencyIdx);
  return { at, state: sessionReduce(state, { type: "correction_done", at }, config) };
}

function endSession(
  cursor: number,
  state: SessionState,
  latencyIdx: number,
): { at: number; state: SessionState } {
  const at = cursor + cyclic(REACTION_LATENCIES_MS, latencyIdx);
  return { at, state: sessionReduce(state, { type: "end_requested", at }, config) };
}

function assertState(
  label: string,
  state: SessionState,
  expect: {
    endReason: SessionState["endReason"];
    startStreak: number;
    handoff: boolean;
    lastSuccessSec: number | null;
  },
): void {
  if (state.endReason !== expect.endReason) {
    throw new Error(`${label}: expected endReason ${expect.endReason}, got ${state.endReason}`);
  }
  if (state.progress.startStreak !== expect.startStreak) {
    throw new Error(
      `${label}: expected startStreak ${expect.startStreak}, got ${state.progress.startStreak}`,
    );
  }
  if (state.handoffToScheduler !== expect.handoff) {
    throw new Error(
      `${label}: expected handoffToScheduler ${expect.handoff}, got ${state.handoffToScheduler}`,
    );
  }
  // Exact equality, no tolerance — this is the anti-drift field: every rung traces to a real
  // reducer output, so any float drift here means the arc no longer matches the engine.
  if (state.progress.lastSuccessSec !== expect.lastSuccessSec) {
    throw new Error(
      `${label}: expected lastSuccessSec ${expect.lastSuccessSec}, got ${state.progress.lastSuccessSec}`,
    );
  }
  if (state.phase !== "ended")
    throw new Error(`${label}: session did not reach "ended" (${state.phase})`);
}

// --- driving the ~14-day arc --------------------------------------------------------------------
//
// Rungs (growthFactor 1.5 — defaultsForEtiology("alzheimers"), not the illustrative ×2 doubling):
// r0=15 r1=22.5 r2=33.75 r3=50.625 r4=75.9375 r5=113.90625 r6=170.859375 r7=256.2890625
// r8=384.43359375 r9=576.650390625 r10=864.9755859375 r11=960 (ceiling, maxIntervalSec).
//
// commit e916a1e: the session soft cap (1200s) gates STARTING a new distractor gap, never
// finishing one — `enterDistractor` checks `at - startedAt >= sessionSoftCapSec*1000` only at the
// moment a new gap would begin. A gap already underway always gets its probe, however long it
// runs. That makes the 960s ceiling reachable: climb close enough to it within one session that
// the ceiling gap can still START before the 1200s mark, then let it run past the cap to
// completion. Day −8 below does exactly that, driven by the real reducer — nothing hand-written.
//
// The climb across days −14..−11 is deliberately spread over multiple sessions so day −8 opens at
// r10 (864.9755859375s) — one rung below ceiling. Several sessions end not via an explicit
// caregiver `end_requested` but because the reducer itself declines to start the next gap (cap
// already exceeded) and closes on the last (successful) trial — `enterDistractor` → `closeSession`.
// That auto-close is the same "caregiver" endReason a manual close would produce; the arc leans on
// it wherever the numbers naturally land there rather than forcing an earlier stop.
//
// Days −8/−6 continue the SAME target through two more between-session check-ins (the ceiling
// handoff from day −8 already put it in scheduler "between" mode): a session-start recall on a
// distinct calendar day just reconfirms at the ceiling rung and hands back off; the THIRD distinct
// day (day −6) trips `masteryStreak` (3) and the session ends `"mastered"` straight from the
// start probe — `afterMastery` then opens the booster ladder (PLAN §5). Days −4/−2/−1 are booster
// check-ins driven by the real `onBoosterOutcome` reducer (never `sessionReduce`'s start-probe
// path — that path is pre-mastery-only, see scheduler.ts's contract comment): day −2 is the one
// dip (a missed booster probe — device delivers the errorless correction, patient reconfirms at
// the last-mastered rung before the session closes on its guaranteed win) and day −1 is the
// recovery (cadence climbs back up).

/** One `sessions` row worth of engine-traced trials, plus the two-tap affect around it. */
interface SeedSession {
  startedAt: number;
  endedAt: number;
  trials: TrialRecord[];
  affectPre: "content" | "unsettled";
  affectPost: "content" | "unsettled";
}

interface Arc {
  candidacyTrials: TrialRecord[];
  sessions: SeedSession[];
  finalProgress: TargetProgress;
  schedule: ScheduleState;
  /** epoch ms of the session-start recall that tripped `masteryStreak` (3rd distinct day). */
  masteredAt: number;
}

/** A booster-mode probe — not a `sessionReduce` trial, since the start-probe/mastery path in
 *  session.ts is pre-mastery-only (scheduler.ts's documented contract: booster outcomes are read
 *  by `onBoosterOutcome`, never `onSessionStartOutcome`). The check-in itself is 0-delay
 *  (session-start-shaped); a within-session retrain reconfirmation uses the real reset interval. */
function boosterProbe(
  outcome: Outcome,
  corrected: boolean,
  at: number,
  intervalSec = 0,
): TrialRecord {
  return { intervalSec, outcome, corrected, isScreening: false, at };
}

function driveArc(): Arc {
  const initialProgress: TargetProgress = {
    lastSuccessSec: null,
    startStreak: 0,
    lastStartSuccessDay: null,
    badSessions: 0,
    mastered: false,
    sessionCount: 0,
  };

  const day = (n: number) => zonedTimeMs(dateNDaysAgo(n, PATIENT_TZ), 9, 0, PATIENT_TZ);

  // Day −14: candidacy screen (Brush & Camp), then session 1 (teach + 3 climbs, ends on win).
  let cursor = day(14);
  let candidacy: CandidacyState = initialCandidacyState();
  const sessionStart = cursor;
  let li = 0;
  // All three Brush & Camp levels (0s, 15s, 30s) recalled — wait the level's own duration, then a
  // fixed reaction latency, before each probe (levelIndex advances in lockstep since none miss).
  for (const levelSec of config.candidacyLevelsSec) {
    cursor += levelSec * 1000;
    const at = cursor + cyclic(REACTION_LATENCIES_MS, li++);
    candidacy = candidacyReduce(candidacy, { type: "probe_result", outcome: "recall", at }, config);
    cursor = at;
  }
  if (candidacy.status !== "passed")
    throw new Error(`candidacy: expected passed, got ${candidacy.status}`);

  cursor += 5_000; // candidacy done, begin teaching
  let s1 = startSession(initialProgress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s1 } = teach(cursor, s1, li++));
  ({ at: cursor, state: s1 } = wait(cursor, s1));
  ({ at: cursor, state: s1 } = probe(cursor, s1, "recall", li++)); // r0
  ({ at: cursor, state: s1 } = wait(cursor, s1));
  ({ at: cursor, state: s1 } = probe(cursor, s1, "recall", li++)); // r1
  ({ at: cursor, state: s1 } = wait(cursor, s1));
  ({ at: cursor, state: s1 } = probe(cursor, s1, "recall", li++)); // r2
  ({ at: cursor, state: s1 } = endSession(cursor, s1, li++));
  assertState("session1", s1, {
    endReason: "caregiver",
    startStreak: 0,
    handoff: false,
    lastSuccessSec: 33.75, // r2
  });
  const session1End = cursor;

  // Day −13: session 2 — start-probe recall (streak 1), one ladder miss + errorless correction,
  // recovery, then climbs r3->r4. Ends on an explicit caregiver close (well under the soft cap).
  cursor = day(13);
  let s2 = startSession(s1.progress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s2 } = probe(cursor, s2, "recall", li++)); // start probe -> streak 1
  ({ at: cursor, state: s2 } = wait(cursor, s2));
  ({ at: cursor, state: s2 } = probe(cursor, s2, "recall", li++)); // reconfirm r2
  ({ at: cursor, state: s2 } = wait(cursor, s2));
  ({ at: cursor, state: s2 } = probe(cursor, s2, "miss", li++)); // miss at r3
  ({ at: cursor, state: s2 } = correct(cursor, s2, li++));
  ({ at: cursor, state: s2 } = wait(cursor, s2));
  ({ at: cursor, state: s2 } = probe(cursor, s2, "recall", li++)); // recover at r2
  ({ at: cursor, state: s2 } = wait(cursor, s2));
  ({ at: cursor, state: s2 } = probe(cursor, s2, "recall", li++)); // climb to r3
  ({ at: cursor, state: s2 } = wait(cursor, s2));
  ({ at: cursor, state: s2 } = probe(cursor, s2, "recall", li++)); // climb to r4
  ({ at: cursor, state: s2 } = endSession(cursor, s2, li++));
  assertState("session2", s2, {
    endReason: "caregiver",
    startStreak: 1,
    handoff: false,
    lastSuccessSec: 75.9375, // r4
  });
  const session2End = cursor;

  // Day −12: session 3 — start-probe recall (streak 2), climbs r5->r9. The r9 recall's own
  // follow-up gap (r10, 864.9755859375s) can't START — cumulative elapsed already exceeds the
  // 1200s soft cap at that point — so the reducer auto-closes on the last (successful) trial
  // instead of an explicit end_requested. Same "caregiver" endReason a manual close would give.
  cursor = day(12);
  let s3 = startSession(s2.progress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // start probe -> streak 2
  ({ at: cursor, state: s3 } = wait(cursor, s3));
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // reconfirm r4
  ({ at: cursor, state: s3 } = wait(cursor, s3));
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // climb r5
  ({ at: cursor, state: s3 } = wait(cursor, s3));
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // climb r6
  ({ at: cursor, state: s3 } = wait(cursor, s3));
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // climb r7
  ({ at: cursor, state: s3 } = wait(cursor, s3));
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // climb r8
  ({ at: cursor, state: s3 } = wait(cursor, s3));
  ({ at: cursor, state: s3 } = probe(cursor, s3, "recall", li++)); // climb r9 -> auto-closes
  assertState("session3", s3, {
    endReason: "caregiver",
    startStreak: 2,
    handoff: false,
    lastSuccessSec: 576.650390625, // r9
  });
  const session3End = cursor;

  // Day −11: session 4 — start-probe MISS (streak resets), errorless correction reverts to the
  // last successful rung (r9), reconfirm r9, climb to r10. As in session 3, the follow-up gap
  // (the 960s ceiling gap) can't start before the cap, so the reducer auto-closes on the r10
  // recall — leaving day −10 to open at r10, one rung below ceiling.
  cursor = day(11);
  let s4 = startSession(s3.progress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s4 } = probe(cursor, s4, "miss", li++)); // start probe MISS -> streak 0
  ({ at: cursor, state: s4 } = correct(cursor, s4, li++));
  ({ at: cursor, state: s4 } = wait(cursor, s4));
  ({ at: cursor, state: s4 } = probe(cursor, s4, "recall", li++)); // reconfirm r9
  ({ at: cursor, state: s4 } = wait(cursor, s4));
  ({ at: cursor, state: s4 } = probe(cursor, s4, "recall", li++)); // climb r10 -> auto-closes
  assertState("session4", s4, {
    endReason: "caregiver",
    startStreak: 0,
    handoff: false,
    lastSuccessSec: 864.9755859375, // r10
  });
  const session4End = cursor;

  // Day −10: session 5 — start-probe recall (streak 1), reconfirm r10, then the ceiling gap (960s)
  // starts comfortably under the cap (~869s elapsed) and runs to completion past it — a started
  // wait always gets its probe. The ceiling recall ends the session via the scheduler handoff.
  cursor = day(10);
  let s5 = startSession(s4.progress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s5 } = probe(cursor, s5, "recall", li++)); // start probe -> streak 1
  ({ at: cursor, state: s5 } = wait(cursor, s5));
  ({ at: cursor, state: s5 } = probe(cursor, s5, "recall", li++)); // reconfirm r10
  ({ at: cursor, state: s5 } = wait(cursor, s5)); // ceiling gap (960s) — starts < cap, runs past it
  ({ at: cursor, state: s5 } = probe(cursor, s5, "recall", li++)); // recall at ceiling (r11=960)
  assertState("session5", s5, {
    endReason: "ceiling",
    startStreak: 1,
    handoff: true,
    lastSuccessSec: 960, // r11 — ceiling
  });
  const session5End = cursor;

  // First entry into between-session mode — no persisted ScheduleState existed before this.
  let schedule = afterCeilingHandoff(session5End, config);

  // Day −8: session 6 — a second distinct-day start-probe recall (streak 2, not yet mastered) just
  // reconfirms at the already-mastered ceiling rung (960s) and hands off to the scheduler again
  // (same "ceiling" endReason, not a new rung). The orchestrator feeds the SAME start-probe outcome
  // to both `sessionReduce` (streak bookkeeping, here) and `onSessionStartOutcome` (gap growth,
  // below) per scheduler.ts's documented contract.
  cursor = day(8);
  let s6 = startSession(s5.progress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s6 } = probe(cursor, s6, "recall", li++)); // start probe -> streak 2
  ({ at: cursor, state: s6 } = wait(cursor, s6)); // reconfirm at the ceiling rung (960s)
  ({ at: cursor, state: s6 } = probe(cursor, s6, "recall", li++)); // recall at ceiling
  assertState("session6", s6, {
    endReason: "ceiling",
    startStreak: 2,
    handoff: true,
    lastSuccessSec: 960,
  });
  const session6End = cursor;
  const startTrial0 = s6.trials[0];
  if (!startTrial0) throw new Error("session6: missing start-probe trial");
  schedule = onSessionStartOutcome(schedule, startTrial0.outcome, session6End, config).state;

  // Day −6: session 7 — the THIRD distinct-day start-probe recall trips `masteryStreak` (3) —
  // the session ends `"mastered"` straight from the start probe (no reconfirm gap; see
  // handleStartProbe in session.ts). The between-mode `ScheduleState` above is discarded per the
  // §5 contract; `afterMastery` opens the booster ladder at step 0.
  cursor = day(6);
  let s7 = startSession(s6.progress, { at: cursor, timeZone: PATIENT_TZ }, config);
  li = 0;
  ({ at: cursor, state: s7 } = probe(cursor, s7, "recall", li++)); // start probe -> streak 3 -> mastered
  assertState("session7", s7, {
    endReason: "mastered",
    startStreak: 3,
    handoff: true,
    lastSuccessSec: 960,
  });
  const session7End = cursor;
  schedule = afterMastery(session7End, config); // between-mode result discarded per the §5 contract

  // Day −4: booster A — an on-time booster probe recall. `onBoosterOutcome` (never
  // `sessionReduce`'s start-probe path, which is pre-mastery-only) advances the cadence step
  // 0 -> 1 (7d -> 14d).
  const boosterAAt = day(4) + cyclic(REACTION_LATENCIES_MS, 0);
  const boosterATrial = boosterProbe("recall", false, boosterAAt);
  schedule = onBoosterOutcome(schedule, "recall", boosterAAt, config).state;

  // Day −2: booster B — THE dip. A missed booster probe (device delivers the errorless
  // correction), then — per the reopened-within-session-retraining contract — one reconfirmation
  // at the last-mastered rung (960s, `resetIntervalSec` with `lastSuccessSec` still 960) before the
  // session closes on its guaranteed win. `onBoosterOutcome` drops the cadence step 1 -> 0.
  const boosterBMissAt = day(2) + cyclic(REACTION_LATENCIES_MS, 0);
  const boosterBMiss = boosterProbe("miss", true, boosterBMissAt);
  const { state: afterDip, reopenWithinSession } = onBoosterOutcome(
    schedule,
    "miss",
    boosterBMissAt,
    config,
  );
  schedule = afterDip;
  if (!reopenWithinSession) throw new Error("booster dip: expected reopenWithinSession");
  const boosterBRetrainSec = resetIntervalSec(s7.progress.lastSuccessSec, config); // 960 (ceiling)
  const boosterBRecoverAt =
    boosterBMissAt + cyclic(REACTION_LATENCIES_MS, 1) * 1000 + boosterBRetrainSec * 1000;
  const boosterBRecover = boosterProbe("recall", false, boosterBRecoverAt, boosterBRetrainSec);

  // Day −1: booster C — the recovery. A clean booster probe recall the next cadence check-in,
  // climbing the step back 0 -> 1.
  const boosterCAt = day(1) + cyclic(REACTION_LATENCIES_MS, 0);
  const boosterCTrial = boosterProbe("recall", false, boosterCAt);
  schedule = onBoosterOutcome(schedule, "recall", boosterCAt, config).state;

  const finalProgress: TargetProgress = {
    ...s7.progress,
    // 3 booster check-ins ran as their own sessions, outside `startSession`'s own counting.
    sessionCount: s7.progress.sessionCount + 3,
  };

  return {
    candidacyTrials: candidacy.trials,
    sessions: [
      { startedAt: sessionStart, endedAt: session1End, trials: s1.trials, ...AFFECT.s1 },
      { startedAt: day(13), endedAt: session2End, trials: s2.trials, ...AFFECT.s2 },
      { startedAt: day(12), endedAt: session3End, trials: s3.trials, ...AFFECT.s3 },
      { startedAt: day(11), endedAt: session4End, trials: s4.trials, ...AFFECT.s4 },
      { startedAt: day(10), endedAt: session5End, trials: s5.trials, ...AFFECT.s5 },
      { startedAt: day(8), endedAt: session6End, trials: s6.trials, ...AFFECT.s6 },
      { startedAt: day(6), endedAt: session7End, trials: s7.trials, ...AFFECT.s7 },
      {
        startedAt: day(4),
        endedAt: boosterAAt,
        trials: [boosterATrial],
        ...AFFECT.boosterA,
      },
      {
        startedAt: day(2),
        endedAt: boosterBRecoverAt,
        trials: [boosterBMiss, boosterBRecover],
        ...AFFECT.boosterB,
      },
      {
        startedAt: day(1),
        endedAt: boosterCAt,
        trials: [boosterCTrial],
        ...AFFECT.boosterC,
      },
    ],
    finalProgress,
    schedule,
    masteredAt: session7End,
  };
}

// --- persistence ---------------------------------------------------------------------------

function trialRow(sessionId: string, targetId: string, tr: TrialRecord, idx: number) {
  return {
    session_id: sessionId,
    target_id: targetId,
    interval_sec: tr.intervalSec,
    outcome: tr.outcome,
    is_screening: tr.isScreening,
    corrected: tr.corrected,
    latency_ms: cyclic(UI_LATENCIES_MS, idx),
    at: new Date(tr.at).toISOString(),
  };
}

async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.email === email)?.id ?? null;
}

async function wipeExisting(admin: SupabaseClient, email: string): Promise<void> {
  const existingId = await findUserIdByEmail(admin, email);
  if (!existingId) return;
  // audit_log has no FK by design (survives erasure), so the user-delete cascade can't reach
  // it — wipe the demo user's rows explicitly to keep re-seeding truly idempotent.
  const auditWipe = await admin.from("audit_log").delete().eq("caregiver_id", existingId);
  if (auditWipe.error) throw new Error(`audit_log wipe failed: ${auditWipe.error.message}`);
  const { error } = await admin.auth.admin.deleteUser(existingId);
  if (error) throw new Error(`deleteUser failed: ${error.message}`);
}

async function seed(): Promise<void> {
  const allowRemote = process.argv.includes("--allow-remote");
  const env = resolveEnv();
  assertLocal(env.url, allowRemote);
  const password = requireEnv("DEMO_CAREGIVER_PASSWORD");

  const admin = createClient(env.url, env.serviceRoleKey);

  await wipeExisting(admin, DEMO_EMAIL);

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password,
    email_confirm: true,
  });
  if (userErr || !userData.user) throw new Error(`createUser failed: ${userErr?.message}`);
  const caregiverId = userData.user.id;

  const now = new Date().toISOString();

  const { data: patient, error: patientErr } = await admin
    .from("patients")
    .insert({
      caregiver_id: caregiverId,
      display_name: "Marta",
      timezone: PATIENT_TZ,
      etiology: "alzheimers",
      is_demo: true,
      notes: null,
    })
    .select("id")
    .single();
  if (patientErr || !patient) throw new Error(`patient insert failed: ${patientErr?.message}`);
  const patientId = patient.id as string;

  const { error: consentErr } = await admin.from("consent").insert({
    patient_id: patientId,
    patient_consent: true,
    caregiver_role_ack: true,
    granted_at: now,
  });
  if (consentErr) throw new Error(`consent insert failed: ${consentErr.message}`);

  const { data: target, error: targetErr } = await admin
    .from("targets")
    .insert({
      patient_id: patientId,
      question: "What is your granddaughter's name?",
      answer: "Lena",
      accepted_variants: ["Lenka"],
      answer_format: answerFormat,
      candidacy: "passed",
      status: "active",
      // Placeholder path — the real photo asset is a Phase 6 §16.2 deliverable.
      image_url: "/images/lena.jpg",
    })
    .select("id")
    .single();
  if (targetErr || !target) throw new Error(`target insert failed: ${targetErr?.message}`);
  const targetId = target.id as string;

  const { error: auditErr } = await admin
    .from("audit_log")
    .insert({ caregiver_id: caregiverId, action: "consent_granted", detail: {} });
  if (auditErr) throw new Error(`audit_log insert failed: ${auditErr.message}`);

  const arc = driveArc();

  let trialCount = 0;
  for (const [i, session] of arc.sessions.entries()) {
    const { data: sessionRow, error: sessionErr } = await admin
      .from("sessions")
      .insert({
        patient_id: patientId,
        started_at: new Date(session.startedAt).toISOString(),
        ended_at: new Date(session.endedAt).toISOString(),
        // two-tap affect (5.4) — a fixed, plausible mix per session (see the AFFECT map).
        affect_pre: session.affectPre,
        affect_post: session.affectPost,
        summary: null,
      })
      .select("id")
      .single();
    if (sessionErr || !sessionRow) throw new Error(`session insert failed: ${sessionErr?.message}`);

    const trials = i === 0 ? [...arc.candidacyTrials, ...session.trials] : session.trials;
    const rows = trials.map((tr, idx) => trialRow(sessionRow.id, targetId, tr, trialCount + idx));
    trialCount += rows.length;
    const { error: trialsErr } = await admin.from("trials").insert(rows);
    if (trialsErr) throw new Error(`trials insert failed: ${trialsErr.message}`);
  }

  const progress = arc.finalProgress;
  const { schedule } = arc;
  const { error: targetStateErr } = await admin.from("target_state").insert({
    target_id: targetId,
    last_success_interval_sec: progress.lastSuccessSec,
    start_streak: progress.startStreak,
    last_start_success_day: progress.lastStartSuccessDay,
    bad_sessions: progress.badSessions,
    // The real moment mastery was reached (day −6's session-start recall), not the seed run time.
    mastered_at: progress.mastered ? new Date(arc.masteredAt).toISOString() : null,
    session_count: progress.sessionCount,
    // Day −10 reached the ceiling -> scheduler handoff (afterCeilingHandoff); day −6 then reached
    // masteryStreak -> afterMastery opened the booster ladder, which the day −4/−2/−1 check-ins
    // (onBoosterOutcome) walked through the one dip + recovery.
    schedule_mode: schedule.mode,
    between_session_gap_days: schedule.gapDays,
    booster_step: schedule.boosterStep,
    next_due_at: new Date(schedule.nextDueAt).toISOString(),
  });
  if (targetStateErr) throw new Error(`target_state insert failed: ${targetStateErr.message}`);

  // NB: `targets.status` has both a 'mastered' and a 'maintenance' literal, but every read path
  // that finds "the active target" (dashboard/schedule/progress/etiology/session) filters on
  // status IN ('active','maintenance') — 'mastered' is never selected. Setting 'maintenance' here
  // (not the 'mastered' literal a real endSessionAction run would write, see
  // apps/web/src/lib/session/actions.ts applyEndState) keeps every demo surface finding this
  // post-mastery target. Flagged in the PR description as a real app-level inconsistency, not
  // something this seed script should paper over silently.
  if (progress.mastered) {
    const { error: statusErr } = await admin
      .from("targets")
      .update({ status: "maintenance" })
      .eq("id", targetId);
    if (statusErr) throw new Error(`target status update failed: ${statusErr.message}`);
  }

  await printSummary(admin, caregiverId, patientId, targetId);
}

async function printSummary(
  admin: SupabaseClient,
  caregiverId: string,
  patientId: string,
  targetId: string,
): Promise<void> {
  const [sessions, trials, targetState] = await Promise.all([
    admin.from("sessions").select("id", { count: "exact", head: true }).eq("patient_id", patientId),
    admin.from("trials").select("id", { count: "exact", head: true }).eq("target_id", targetId),
    admin.from("target_state").select("*").eq("target_id", targetId).single(),
  ]);
  // console.error (not .log) — Biome's noConsole rule allows error/warn only.
  console.error("--- seed summary ---");
  console.error("caregiver_id:", caregiverId);
  console.error("patient_id:", patientId);
  console.error("target_id:", targetId);
  console.error("sessions:", sessions.count);
  console.error("trials:", trials.count);
  console.error("target_state:", JSON.stringify(targetState.data));
  console.error(
    "schedule:",
    `mode=${targetState.data?.schedule_mode} gap_days=${targetState.data?.between_session_gap_days} ` +
      `next_due_at=${targetState.data?.next_due_at}`,
  );
}

const args = process.argv.slice(2);
if (
  !args.includes("--allow-remote") &&
  args.some((a) => a.startsWith("--") && a !== "--allow-remote")
) {
  console.error(`unknown argument: ${args.join(" ")}`);
  process.exit(1);
}

seed().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

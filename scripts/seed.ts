// Demo seed: persona "Marta", target "Lena", five days of engine-generated pre-run trial
// history (TASKS.md 2.5). Every trials/target_state value traces to real @keepsake/core output —
// nothing here is a hand-written row. Idempotent: re-running wipes and recreates the demo graph.
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

// --- driving the 5-day arc --------------------------------------------------------------------
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
// completion. Day −1 below does exactly that, driven by the real reducer — nothing hand-written.
//
// The climb across days −5..−2 is deliberately spread over multiple sessions so day −1 opens at
// r10 (864.9755859375s) — one rung below ceiling. Several sessions end not via an explicit
// caregiver `end_requested` but because the reducer itself declines to start the next gap (cap
// already exceeded) and closes on the last (successful) trial — `enterDistractor` → `closeSession`.
// That auto-close is the same "caregiver" endReason a manual close would produce; the arc leans on
// it wherever the numbers naturally land there rather than forcing an earlier stop.

interface Arc {
  candidacyTrials: TrialRecord[];
  sessions: Array<{ startedAt: number; endedAt: number; trials: TrialRecord[] }>;
  finalProgress: TargetProgress;
  schedule: ScheduleState;
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

  // Day −5: candidacy screen (Brush & Camp), then session 1 (teach + 3 climbs, ends on win).
  let cursor = day(5);
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

  // Day −4: session 2 — start-probe recall (streak 1), one ladder miss + errorless correction,
  // recovery, then climbs r3->r4. Ends on an explicit caregiver close (well under the soft cap).
  cursor = day(4);
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

  // Day −3: session 3 — start-probe recall (streak 2), climbs r5->r9. The r9 recall's own
  // follow-up gap (r10, 864.9755859375s) can't START — cumulative elapsed already exceeds the
  // 1200s soft cap at that point — so the reducer auto-closes on the last (successful) trial
  // instead of an explicit end_requested. Same "caregiver" endReason a manual close would give.
  cursor = day(3);
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

  // Day −2: session 4 — start-probe MISS (streak resets), errorless correction reverts to the
  // last successful rung (r9), reconfirm r9, climb to r10. As in session 3, the follow-up gap
  // (the 960s ceiling gap) can't start before the cap, so the reducer auto-closes on the r10
  // recall — leaving day −1 to open at r10, one rung below ceiling.
  cursor = day(2);
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

  // Day −1: session 5 — start-probe recall (streak 1), reconfirm r10, then the ceiling gap (960s)
  // starts comfortably under the cap (~869s elapsed) and runs to completion past it — a started
  // wait always gets its probe. The ceiling recall ends the session via the scheduler handoff.
  cursor = day(1);
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

  const schedule = afterCeilingHandoff(session5End, config);

  return {
    candidacyTrials: candidacy.trials,
    sessions: [
      { startedAt: sessionStart, endedAt: session1End, trials: s1.trials },
      { startedAt: day(4), endedAt: session2End, trials: s2.trials },
      { startedAt: day(3), endedAt: session3End, trials: s3.trials },
      { startedAt: day(2), endedAt: session4End, trials: s4.trials },
      { startedAt: day(1), endedAt: session5End, trials: s5.trials },
    ],
    finalProgress: s5.progress,
    schedule,
  };
}

// --- driving a second, already-mastered target (V2 multi-target demo) ------------------------
//
// A second memory ("Kraków") that has reached mastery and is now on its booster loop, so the demo
// shows the multi-target queue: "Lena" acquiring, this one settled and running check-ins in
// parallel. Four distinct-day sessions — one teach + three start-probe recalls — take the start
// streak to masteryStreak (3), which the reducer itself ends as `mastered`. Every value still
// traces to real @keepsake/core output; nothing is hand-written. Mastered on day −8 with a 7-day
// first booster cadence → the next check-in falls a day ago, so it reads as "due" on camera.

function driveMasteredArc(): {
  sessions: Array<{ startedAt: number; endedAt: number; trials: TrialRecord[] }>;
  finalProgress: TargetProgress;
  schedule: ScheduleState;
  masteredAt: number;
} {
  const initialProgress: TargetProgress = {
    lastSuccessSec: null,
    startStreak: 0,
    lastStartSuccessDay: null,
    badSessions: 0,
    mastered: false,
    sessionCount: 0,
  };
  const day = (n: number) => zonedTimeMs(dateNDaysAgo(n, PATIENT_TZ), 9, 0, PATIENT_TZ);

  // M1 (day −14): first session — teach + two climbs (r0→r1), ends on a win. streak 0.
  let cursor = day(14);
  let m1 = startSession(initialProgress, { at: cursor, timeZone: PATIENT_TZ }, config);
  let li = 0;
  ({ at: cursor, state: m1 } = teach(cursor, m1, li++));
  ({ at: cursor, state: m1 } = wait(cursor, m1));
  ({ at: cursor, state: m1 } = probe(cursor, m1, "recall", li++)); // r0
  ({ at: cursor, state: m1 } = wait(cursor, m1));
  ({ at: cursor, state: m1 } = probe(cursor, m1, "recall", li++)); // r1
  ({ at: cursor, state: m1 } = endSession(cursor, m1, li++));
  assertState("mastered-m1", m1, {
    endReason: "caregiver",
    startStreak: 0,
    handoff: false,
    lastSuccessSec: 22.5, // r1
  });
  const m1End = cursor;

  // M2 (day −12), M3 (day −10): a start-probe recall each — the streak climbs 1 → 2 across distinct
  // calendar days, and the session closes on that same win (no ladder work needed).
  const startProbeSession = (prev: SessionState, atDay: number, label: string, streak: number) => {
    let s = startSession(prev.progress, { at: atDay, timeZone: PATIENT_TZ }, config);
    let end = atDay;
    ({ at: end, state: s } = probe(atDay, s, "recall", 0)); // start probe → streak++
    ({ at: end, state: s } = endSession(end, s, 1));
    assertState(label, s, {
      endReason: "caregiver",
      startStreak: streak,
      handoff: false,
      lastSuccessSec: 22.5,
    });
    return { state: s, end };
  };
  const m2 = startProbeSession(m1, day(12), "mastered-m2", 1);
  const m3 = startProbeSession(m2.state, day(10), "mastered-m3", 2);

  // M4 (day −8): start-probe recall takes the streak to 3 = mastery. The reducer ends the session
  // itself (endReason "mastered", scheduler handoff) — no explicit caregiver close.
  const m4Day = day(8);
  let m4 = startSession(m3.state.progress, { at: m4Day, timeZone: PATIENT_TZ }, config);
  ({ state: m4 } = probe(m4Day, m4, "recall", 0));
  assertState("mastered-m4", m4, {
    endReason: "mastered",
    startStreak: 3,
    handoff: true,
    lastSuccessSec: 22.5,
  });

  return {
    sessions: [
      { startedAt: day(14), endedAt: m1End, trials: m1.trials },
      { startedAt: day(12), endedAt: m2.end, trials: m2.state.trials },
      { startedAt: day(10), endedAt: m3.end, trials: m3.state.trials },
      { startedAt: m4Day, endedAt: m4Day, trials: m4.trials },
    ],
    finalProgress: m4.progress,
    schedule: afterMastery(m4Day, config),
    masteredAt: m4Day,
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
        // plausible constant two-tap affect (5.4): settled coming in, settled going out
        affect_pre: "content",
        affect_post: "content",
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
    mastered_at: progress.mastered ? now : null,
    session_count: progress.sessionCount,
    // Day −1 reached the ceiling → scheduler handoff (afterCeilingHandoff, scheduler.ts). First
    // between-mode entry for this target, so no prior ScheduleState to preserve.
    schedule_mode: schedule.mode,
    between_session_gap_days: schedule.gapDays,
    booster_step: schedule.boosterStep,
    next_due_at: new Date(schedule.nextDueAt).toISOString(),
  });
  if (targetStateErr) throw new Error(`target_state insert failed: ${targetStateErr.message}`);

  await seedMasteredTarget(admin, patientId);

  await printSummary(admin, caregiverId, patientId, targetId);
}

/**
 * Insert the second, already-mastered target and its four-session booster-loop history so the demo
 * exercises the V2 multi-target queue (one acquiring, one settled). Created AFTER "Lena", so Lena
 * keeps the single acquisition slot; this one runs its check-ins in parallel.
 */
async function seedMasteredTarget(admin: SupabaseClient, patientId: string): Promise<void> {
  const { data: target, error: targetErr } = await admin
    .from("targets")
    .insert({
      patient_id: patientId,
      question: "Where did you grow up?",
      answer: "Kraków",
      accepted_variants: ["Krakow", "Cracow"],
      answer_format: answerFormat,
      candidacy: "passed",
      status: "mastered",
      image_url: "/images/krakow.jpg", // placeholder, mirrors the Lena target
    })
    .select("id")
    .single();
  if (targetErr || !target) throw new Error(`mastered target insert failed: ${targetErr?.message}`);
  const targetId = target.id as string;

  const arc = driveMasteredArc();

  let trialCount = 0;
  for (const session of arc.sessions) {
    const { data: sessionRow, error: sessionErr } = await admin
      .from("sessions")
      .insert({
        patient_id: patientId,
        started_at: new Date(session.startedAt).toISOString(),
        ended_at: new Date(session.endedAt).toISOString(),
        affect_pre: "content",
        affect_post: "content",
        summary: null,
      })
      .select("id")
      .single();
    if (sessionErr || !sessionRow)
      throw new Error(`mastered session insert failed: ${sessionErr?.message}`);
    const rows = session.trials.map((tr, idx) =>
      trialRow(sessionRow.id, targetId, tr, trialCount + idx),
    );
    trialCount += rows.length;
    const { error: trialsErr } = await admin.from("trials").insert(rows);
    if (trialsErr) throw new Error(`mastered trials insert failed: ${trialsErr.message}`);
  }

  const { finalProgress: progress, schedule } = arc;
  const { error: stateErr } = await admin.from("target_state").insert({
    target_id: targetId,
    last_success_interval_sec: progress.lastSuccessSec,
    start_streak: progress.startStreak,
    last_start_success_day: progress.lastStartSuccessDay,
    bad_sessions: progress.badSessions,
    mastered_at: new Date(arc.masteredAt).toISOString(),
    session_count: progress.sessionCount,
    // afterMastery (scheduler.ts): booster loop begins at step 0.
    schedule_mode: schedule.mode,
    between_session_gap_days: schedule.gapDays,
    booster_step: schedule.boosterStep,
    next_due_at: new Date(schedule.nextDueAt).toISOString(),
  });
  if (stateErr) throw new Error(`mastered target_state insert failed: ${stateErr.message}`);
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

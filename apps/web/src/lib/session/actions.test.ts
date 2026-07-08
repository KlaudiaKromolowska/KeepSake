import { defaultsForEtiology, startSession } from "@keepsake/core/sr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireUser } from "@/lib/actions";
import {
  annotateSessionAction,
  endSessionAction,
  recordTrialAction,
  saveSessionAffectAction,
  saveSessionNoteAction,
  startSessionAction,
} from "./actions";

vi.mock("@/lib/actions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions")>();
  return { ...actual, requireUser: vi.fn() };
});

type RequireUserResult = Awaited<ReturnType<typeof requireUser>>;

const NOW = 1_700_000_000_000; // 2023-11-14 in Europe/Warsaw
const DAY = 86_400_000;
const TZ = "Europe/Warsaw";
const config = defaultsForEtiology("alzheimers").config;

const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_TARGET_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

/** Chainable, thenable Supabase stub. Every test supplies a `route(state)` → `{ data, error }`. */
interface CallState {
  table: string;
  verb?: "select" | "insert" | "update" | "upsert";
  filters: Record<string, unknown>;
  payload?: unknown;
}
function makeSupabase(route: (s: CallState) => { data: unknown; error: unknown }) {
  const calls: CallState[] = [];
  function builder(table: string) {
    const state: CallState = { table, filters: {} };
    const exec = () => {
      calls.push(state);
      return route(state) ?? { data: null, error: null };
    };
    const b = {
      select(_sel?: string) {
        state.verb ??= "select";
        return b;
      },
      insert(p: unknown) {
        state.verb = "insert";
        state.payload = p;
        return b;
      },
      update(p: unknown) {
        state.verb = "update";
        state.payload = p;
        return b;
      },
      upsert(p: unknown) {
        state.verb = "upsert";
        state.payload = p;
        return b;
      },
      eq(k: string, v: unknown) {
        state.filters[k] = v;
        return b;
      },
      is(k: string, v: unknown) {
        state.filters[k] = v;
        return b;
      },
      order() {
        return b;
      },
      limit() {
        return b;
      },
      single() {
        return Promise.resolve(exec());
      },
      maybeSingle() {
        return Promise.resolve(exec());
      },
      // biome-ignore lint/suspicious/noThenProperty: real Supabase query builders are thenable — the stub mirrors that so awaited insert/update chains resolve.
      then<R>(onF: (v: { data: unknown; error: unknown }) => R) {
        return Promise.resolve(exec()).then(onF);
      },
    };
    return b;
  }
  return { client: { from: builder }, calls };
}

function mockUser(client: unknown) {
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: "user-1" },
    supabase: client,
  } as unknown as RequireUserResult);
}

/** Full, schema-valid SessionState snapshot; override per case. */
function snap(overrides: Record<string, unknown> = {}) {
  return {
    phase: "ended",
    intervalSec: 0,
    baseMisses: 0,
    unclearRun: 0,
    startedAt: NOW,
    startedDay: "2023-11-14",
    timeZone: TZ,
    isStartProbe: false,
    progress: {
      lastSuccessSec: null,
      startStreak: 0,
      lastStartSuccessDay: null,
      badSessions: 0,
      mastered: false,
      sessionCount: 1,
    },
    trials: [] as unknown[],
    endReason: "caregiver",
    handoffToScheduler: false,
    rescopeRequired: false,
    ...overrides,
  };
}

const activeTarget = {
  id: TARGET_ID,
  question: "Who is this?",
  answer: "Your granddaughter Ana",
  image_url: "https://img/ana.jpg",
  status: "active",
  patient_id: "p-1",
};

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

describe("startSessionAction", () => {
  it("fresh start: no open session → inserts row with snapshot + startProbe, resumed false", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select") return { data: null, error: null };
      if (s.table === "target_state") return { data: null, error: null };
      if (s.table === "sessions" && s.verb === "insert")
        return { data: { id: "sess-new" }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.error).toBeNull();
    expect(result.data?.resumed).toBe(false);
    expect(result.data?.sessionId).toBe("sess-new");
    expect(result.data?.target).toEqual({
      id: TARGET_ID,
      question: activeTarget.question,
      answer: activeTarget.answer,
      imageUrl: activeTarget.image_url,
    });
    expect(result.data?.config.growthFactor).toBe(1.5); // alzheimers tuning
    const insert = calls.find((c) => c.table === "sessions" && c.verb === "insert");
    const payload = insert?.payload as {
      summary: { snapshot: { phase: string }; startProbe: boolean };
    };
    expect(payload.summary.snapshot.phase).toBe("teach"); // first session
    expect(payload.summary.startProbe).toBe(false);
  });

  it("same-day open session with valid snapshot → resume, resumed true, no insert", async () => {
    const openSnap = startSession(
      {
        lastSuccessSec: 30,
        startStreak: 1,
        lastStartSuccessDay: null,
        badSessions: 0,
        mastered: false,
        sessionCount: 2,
      },
      { at: NOW, timeZone: TZ },
      config,
    );
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select")
        return {
          data: {
            id: "open-1",
            summary: { snapshot: openSnap, startProbe: true, targetId: TARGET_ID },
          },
          error: null,
        };
      if (s.table === "sessions" && s.verb === "update") return { data: null, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.error).toBeNull();
    expect(result.data?.resumed).toBe(true);
    expect(result.data?.sessionId).toBe("open-1");
    expect(result.data?.state.phase).toBe("distractor"); // resumeSession re-enters here
    expect(calls.some((c) => c.table === "sessions" && c.verb === "insert")).toBe(false);
    const update = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const payload = update?.payload as {
      summary: { snapshot: { phase: string }; startProbe: boolean };
    };
    expect(payload.summary.snapshot.phase).toBe("distractor");
    expect(payload.summary.startProbe).toBe(true); // other keys preserved
  });

  it("stale (previous-day) open session → closed with discarded + fresh start", async () => {
    const staleSnap = startSession(
      {
        lastSuccessSec: null,
        startStreak: 0,
        lastStartSuccessDay: null,
        badSessions: 0,
        mastered: false,
        sessionCount: 0,
      },
      { at: NOW - 25 * 60 * 60 * 1000, timeZone: TZ },
      config,
    );
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select")
        return { data: { id: "open-1", summary: { snapshot: staleSnap } }, error: null };
      if (s.table === "sessions" && s.verb === "update") return { data: null, error: null };
      if (s.table === "target_state") return { data: null, error: null };
      if (s.table === "sessions" && s.verb === "insert")
        return { data: { id: "sess-new" }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.error).toBeNull();
    expect(result.data?.resumed).toBe(false);
    expect(result.data?.sessionId).toBe("sess-new");
    const close = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const payload = close?.payload as { ended_at: string; summary: { discarded: boolean } };
    expect(payload.ended_at).toBe(new Date(NOW).toISOString());
    expect(payload.summary.discarded).toBe(true);
  });

  it("open session with corrupt snapshot → discarded + fresh start", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select")
        return { data: { id: "open-1", summary: { snapshot: { junk: true } } }, error: null };
      if (s.table === "sessions" && s.verb === "update") return { data: null, error: null };
      if (s.table === "target_state") return { data: null, error: null };
      if (s.table === "sessions" && s.verb === "insert")
        return { data: { id: "sess-new" }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.data?.resumed).toBe(false);
    const close = calls.find((c) => c.table === "sessions" && c.verb === "update");
    expect((close?.payload as { summary: { discarded: boolean } }).summary.discarded).toBe(true);
  });

  it("open session for a DIFFERENT target → discarded + fresh start (no cross-target resume)", async () => {
    // A valid, same-day, resumable snapshot — but pinned to another target in summary.targetId.
    const otherSnap = startSession(
      {
        lastSuccessSec: 30,
        startStreak: 1,
        lastStartSuccessDay: null,
        badSessions: 0,
        mastered: false,
        sessionCount: 2,
      },
      { at: NOW, timeZone: TZ },
      config,
    );
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select")
        return {
          data: {
            id: "open-1",
            summary: { snapshot: otherSnap, startProbe: true, targetId: OTHER_TARGET_ID },
          },
          error: null,
        };
      if (s.table === "sessions" && s.verb === "update") return { data: null, error: null };
      if (s.table === "target_state") return { data: null, error: null };
      if (s.table === "sessions" && s.verb === "insert")
        return { data: { id: "sess-new" }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.error).toBeNull();
    expect(result.data?.resumed).toBe(false);
    expect(result.data?.sessionId).toBe("sess-new");
    const close = calls.find((c) => c.table === "sessions" && c.verb === "update");
    expect((close?.payload as { summary: { discarded: boolean } }).summary.discarded).toBe(true);
  });

  it("open-session read error → error result, no insert (fail closed)", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select")
        return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.data).toBeNull();
    expect(typeof result.error).toBe("string");
    expect(calls.some((c) => c.table === "sessions" && c.verb === "insert")).toBe(false);
  });

  it("target_state read error → error result, no insert (fail closed, no zero-init)", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: activeTarget, error: null };
      if (s.table === "patients")
        return { data: { timezone: TZ, etiology: "alzheimers" }, error: null };
      if (s.table === "sessions" && s.verb === "select") return { data: null, error: null };
      if (s.table === "target_state") return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.data).toBeNull();
    expect(typeof result.error).toBe("string");
    expect(calls.some((c) => c.table === "sessions" && c.verb === "insert")).toBe(false);
  });

  it("target not active/maintenance → error result, no insert", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "targets") return { data: { ...activeTarget, status: "draft" }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await startSessionAction({ targetId: TARGET_ID });

    expect(result.data).toBeNull();
    expect(typeof result.error).toBe("string");
    expect(calls.some((c) => c.table === "sessions" && c.verb === "insert")).toBe(false);
  });

  it("rejects a non-uuid targetId", async () => {
    mockUser(makeSupabase(() => ({ data: null, error: null })).client);
    const result = await startSessionAction({ targetId: "nope" });
    expect(result.data).toBeNull();
    expect(typeof result.error).toBe("string");
  });
});

describe("recordTrialAction", () => {
  const trial = {
    intervalSec: 30,
    outcome: "recall" as const,
    isScreening: false,
    corrected: false,
    at: NOW,
  };

  it("inserts a mapped trial row and merges snapshot into summary", async () => {
    const newSnap = snap({ phase: "distractor" });
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "trials") return { data: null, error: null };
      if (s.table === "sessions" && s.verb === "select")
        return {
          data: { summary: { snapshot: { phase: "old" }, startProbe: true, note: "keep" } },
          error: null,
        };
      if (s.table === "sessions" && s.verb === "update") return { data: null, error: null };
      return { data: null, error: null };
    });
    mockUser(client);

    const result = await recordTrialAction({
      sessionId: SESSION_ID,
      targetId: TARGET_ID,
      trial,
      snapshot: newSnap,
    });

    expect(result).toEqual({ data: null, error: null });
    const ins = calls.find((c) => c.table === "trials" && c.verb === "insert");
    expect(ins?.payload).toEqual({
      session_id: SESSION_ID,
      target_id: TARGET_ID,
      interval_sec: 30,
      outcome: "recall",
      is_screening: false,
      corrected: false,
      at: new Date(NOW).toISOString(),
    });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const summary = (upd?.payload as { summary: Record<string, unknown> }).summary;
    expect(summary.snapshot).toEqual(newSnap); // snapshot replaced
    expect(summary.startProbe).toBe(true); // other keys preserved
    expect(summary.note).toBe("keep");
  });

  it("rejects bad trial input with an error result", async () => {
    mockUser(makeSupabase(() => ({ data: null, error: null })).client);
    const result = await recordTrialAction({
      sessionId: SESSION_ID,
      targetId: TARGET_ID,
      trial: { ...trial, at: -1 },
      snapshot: snap(),
    });
    expect(result.data).toBeNull();
    expect(typeof result.error).toBe("string");
  });
});

describe("endSessionAction", () => {
  function endClient(
    sessionRow: Record<string, unknown>,
    stateRow: Record<string, unknown> | null,
    extra?: (s: CallState) => { data: unknown; error: unknown } | undefined,
  ) {
    return makeSupabase((s) => {
      const e = extra?.(s);
      if (e) return e;
      if (s.table === "sessions" && s.verb === "select") return { data: sessionRow, error: null };
      if (s.table === "patients") return { data: { etiology: "alzheimers" }, error: null };
      if (s.table === "target_state" && s.verb === "select") return { data: stateRow, error: null };
      return { data: null, error: null };
    });
  }

  it("rejects a snapshot whose phase is not ended", async () => {
    mockUser(makeSupabase(() => ({ data: null, error: null })).client);
    const result = await endSessionAction({
      sessionId: SESSION_ID,
      targetId: TARGET_ID,
      snapshot: snap({ phase: "awaiting_probe" }),
    });
    expect(result.data).toBeNull();
    expect(typeof result.error).toBe("string");
  });

  it("already-ended session → idempotent no-op, no target_state write", async () => {
    const { client, calls } = endClient(
      { ended_at: new Date(NOW).toISOString(), summary: {}, patient_id: "p-1" },
      null,
    );
    mockUser(client);
    const result = await endSessionAction({
      sessionId: SESSION_ID,
      targetId: TARGET_ID,
      snapshot: snap(),
    });
    expect(result).toEqual({ data: null, error: null });
    expect(calls.some((c) => c.table === "target_state" && c.verb === "upsert")).toBe(false);
  });

  it("writes ended_at + summary stats", async () => {
    const { client, calls } = endClient(
      { ended_at: null, summary: { startProbe: false, keep: "x" }, patient_id: "p-1" },
      null,
    );
    mockUser(client);
    const s = snap({
      trials: [
        { intervalSec: 15, outcome: "recall", isScreening: false, corrected: true, at: NOW },
        { intervalSec: 15, outcome: "miss", isScreening: false, corrected: true, at: NOW },
      ],
      rescopeRequired: false,
    });
    await endSessionAction({ sessionId: SESSION_ID, targetId: TARGET_ID, snapshot: s });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const payload = upd?.payload as { ended_at: string; summary: Record<string, unknown> };
    expect(payload.ended_at).toBe(new Date(NOW).toISOString());
    expect(payload.summary.keep).toBe("x");
    expect(payload.summary.stats).toEqual({
      recalls: 1,
      misses: 1,
      unclears: 0,
      endReason: "caregiver",
      rescopeRequired: false,
    });
  });

  it("(a) mastered → afterMastery, targets mastered, mastered_at set", async () => {
    const { client, calls } = endClient(
      { ended_at: null, summary: { startProbe: true }, patient_id: "p-1" },
      null,
    );
    mockUser(client);
    const s = snap({
      endReason: "mastered",
      handoffToScheduler: true,
      progress: {
        lastSuccessSec: 60,
        startStreak: 3,
        lastStartSuccessDay: "2023-11-14",
        badSessions: 0,
        mastered: true,
        sessionCount: 4,
      },
      trials: [
        { intervalSec: 0, outcome: "recall", isScreening: false, corrected: false, at: NOW },
      ],
    });
    await endSessionAction({ sessionId: SESSION_ID, targetId: TARGET_ID, snapshot: s });

    const ts = calls.find((c) => c.table === "target_state" && c.verb === "upsert");
    const p = ts?.payload as Record<string, unknown>;
    expect(p.schedule_mode).toBe("booster");
    expect(p.booster_step).toBe(0);
    expect(p.between_session_gap_days).toBe(0);
    expect(p.next_due_at).toBe(new Date(NOW + config.boosterCadenceDays[0] * DAY).toISOString());
    expect(p.mastered_at).toBe(new Date(NOW).toISOString());
    const tgt = calls.find((c) => c.table === "targets" && c.verb === "update");
    expect((tgt?.payload as { status: string }).status).toBe("mastered");
  });

  it("(b) no existing schedule + ceiling → afterCeilingHandoff", async () => {
    const { client, calls } = endClient(
      { ended_at: null, summary: { startProbe: false }, patient_id: "p-1" },
      null,
    );
    mockUser(client);
    const s = snap({
      endReason: "ceiling",
      handoffToScheduler: true,
      trials: [
        { intervalSec: 960, outcome: "recall", isScreening: false, corrected: false, at: NOW },
      ],
    });
    await endSessionAction({ sessionId: SESSION_ID, targetId: TARGET_ID, snapshot: s });
    const ts = calls.find((c) => c.table === "target_state" && c.verb === "upsert");
    const p = ts?.payload as Record<string, unknown>;
    expect(p.schedule_mode).toBe("between");
    expect(p.between_session_gap_days).toBe(config.firstGapDays);
    expect(p.next_due_at).toBe(new Date(NOW + config.firstGapDays * DAY).toISOString());
  });

  it("(c) existing schedule + start probe recall → onSessionStartOutcome persisted", async () => {
    const existingDue = "2023-11-10T00:00:00.000Z";
    const { client, calls } = endClient(
      { ended_at: null, summary: { startProbe: true }, patient_id: "p-1" },
      {
        schedule_mode: "between",
        between_session_gap_days: 2,
        booster_step: 0,
        next_due_at: existingDue,
        mastered_at: null,
      },
    );
    mockUser(client);
    const s = snap({
      endReason: "caregiver",
      trials: [
        { intervalSec: 0, outcome: "recall", isScreening: false, corrected: false, at: NOW },
      ],
    });
    await endSessionAction({ sessionId: SESSION_ID, targetId: TARGET_ID, snapshot: s });
    const ts = calls.find((c) => c.table === "target_state" && c.verb === "upsert");
    const p = ts?.payload as Record<string, unknown>;
    // recall grows gap 2 → min(2*1.5,14)=3
    expect(p.between_session_gap_days).toBe(3);
    expect(p.next_due_at).toBe(new Date(NOW + 3 * DAY).toISOString());
    expect(p.schedule_mode).toBe("between");
  });

  it("(d) existing schedule, no start probe → schedule unchanged", async () => {
    const existingDue = "2023-11-10T00:00:00.000Z";
    const { client, calls } = endClient(
      { ended_at: null, summary: { startProbe: false }, patient_id: "p-1" },
      {
        schedule_mode: "between",
        between_session_gap_days: 2,
        booster_step: 0,
        next_due_at: existingDue,
        mastered_at: null,
      },
    );
    mockUser(client);
    const s = snap({ endReason: "caregiver", trials: [] });
    await endSessionAction({ sessionId: SESSION_ID, targetId: TARGET_ID, snapshot: s });
    const ts = calls.find((c) => c.table === "target_state" && c.verb === "upsert");
    const p = ts?.payload as Record<string, unknown>;
    expect(p.schedule_mode).toBe("between");
    expect(p.between_session_gap_days).toBe(2);
    expect(p.next_due_at).toBe(existingDue);
  });

  it("(retry heal) already-ended with stored applied values → re-applies them, no recompute", async () => {
    // Simulates a retry after the target_state upsert failed on the first attempt but the
    // sessions-close (single commit point) had already stored the applied bundle. The heal must
    // write the STORED gap (3), never re-grow it from a re-read state, and must not re-read
    // patients/target_state or re-close the session.
    const storedSchedule = {
      schedule_mode: "between",
      between_session_gap_days: 3,
      booster_step: 0,
      next_due_at: "2023-11-17T00:00:00.000Z",
    };
    const storedProgress = {
      last_success_interval_sec: 60,
      start_streak: 2,
      last_start_success_day: "2023-11-14",
      bad_sessions: 0,
      session_count: 3,
    };
    const { client, calls } = endClient(
      {
        ended_at: new Date(NOW).toISOString(),
        summary: {
          startProbe: true,
          snapshot: {},
          stats: {},
          appliedSchedule: storedSchedule,
          appliedProgress: storedProgress,
          appliedMasteredAt: null,
          appliedTargetStatus: null,
        },
        patient_id: "p-1",
      },
      null,
    );
    mockUser(client);
    const result = await endSessionAction({
      sessionId: SESSION_ID,
      targetId: TARGET_ID,
      snapshot: snap(),
    });
    expect(result).toEqual({ data: null, error: null });
    // Heal path recomputes nothing → skips patients + target_state read + sessions re-close.
    expect(calls.some((c) => c.table === "patients")).toBe(false);
    expect(calls.some((c) => c.table === "target_state" && c.verb === "select")).toBe(false);
    expect(calls.some((c) => c.table === "sessions" && c.verb === "update")).toBe(false);
    const ts = calls.find((c) => c.table === "target_state" && c.verb === "upsert");
    const p = ts?.payload as Record<string, unknown>;
    expect(p.target_id).toBe(TARGET_ID);
    expect(p.between_session_gap_days).toBe(3); // stored value, NOT a re-grown 5
    expect(p.next_due_at).toBe("2023-11-17T00:00:00.000Z");
    expect(p.session_count).toBe(3);
    expect(p.mastered_at).toBeNull();
    // status untouched when not mastered
    expect(calls.some((c) => c.table === "targets" && c.verb === "update")).toBe(false);
  });
});

describe("saveSessionNoteAction", () => {
  it("merges note into existing summary, preserving other keys", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "sessions" && s.verb === "select")
        return {
          data: { summary: { snapshot: { phase: "ended" }, note: "old", keep: "y" } },
          error: null,
        };
      return { data: null, error: null };
    });
    mockUser(client);
    const result = await saveSessionNoteAction({ sessionId: SESSION_ID, note: "fresh note" });
    expect(result).toEqual({ data: null, error: null });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const summary = (upd?.payload as { summary: Record<string, unknown> }).summary;
    expect(summary.note).toBe("fresh note");
    expect(summary.keep).toBe("y");
    expect(summary.snapshot).toEqual({ phase: "ended" });
  });

  it("rejects empty and oversized notes", async () => {
    mockUser(makeSupabase(() => ({ data: null, error: null })).client);
    expect((await saveSessionNoteAction({ sessionId: SESSION_ID, note: "" })).error).toEqual(
      expect.any(String),
    );
    expect(
      (await saveSessionNoteAction({ sessionId: SESSION_ID, note: "a".repeat(2001) })).error,
    ).toEqual(expect.any(String));
  });
});

describe("saveSessionAffectAction", () => {
  it("writes affect_pre for point 'pre' and only that column", async () => {
    const { client, calls } = makeSupabase(() => ({ data: null, error: null }));
    mockUser(client);
    const result = await saveSessionAffectAction({
      sessionId: SESSION_ID,
      point: "pre",
      affect: "content",
    });
    expect(result).toEqual({ data: null, error: null });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    expect(upd?.payload).toEqual({ affect_pre: "content" });
    expect(upd?.filters).toEqual({ id: SESSION_ID });
  });

  it("writes affect_post for point 'post'", async () => {
    const { client, calls } = makeSupabase(() => ({ data: null, error: null }));
    mockUser(client);
    const result = await saveSessionAffectAction({
      sessionId: SESSION_ID,
      point: "post",
      affect: "unsettled",
    });
    expect(result).toEqual({ data: null, error: null });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    expect(upd?.payload).toEqual({ affect_post: "unsettled" });
  });

  it("rejects values outside the two literals without touching the DB", async () => {
    const { client, calls } = makeSupabase(() => ({ data: null, error: null }));
    mockUser(client);
    const result = await saveSessionAffectAction({
      sessionId: SESSION_ID,
      point: "pre",
      affect: "ecstatic",
    });
    expect(result.error).toEqual(expect.any(String));
    expect(calls).toHaveLength(0);
  });

  it("returns a generic message on a DB error (no raw error leaks)", async () => {
    const dbError = { code: "42501", message: "permission denied for table sessions" };
    const { client } = makeSupabase((s) =>
      s.table === "sessions" && s.verb === "update"
        ? { data: null, error: dbError }
        : { data: null, error: null },
    );
    mockUser(client);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await saveSessionAffectAction({
      sessionId: SESSION_ID,
      point: "post",
      affect: "content",
    });
    spy.mockRestore();
    expect(result.data).toBeNull();
    expect(result.error).toBe("Couldn't save that just now.");
    expect(result.error).not.toContain("permission denied");
  });
});

describe("annotateSessionAction", () => {
  it("appends to an existing annotations array, preserving entries and keys", async () => {
    const existing = { kind: "answer_card", at: NOW - 1000 };
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "sessions" && s.verb === "select")
        return { data: { summary: { annotations: [existing], keep: "z" } }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);
    const result = await annotateSessionAction({
      sessionId: SESSION_ID,
      kind: "interval_override",
      fromSec: 15,
      toSec: 30,
      at: NOW,
    });
    expect(result).toEqual({ data: null, error: null });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const summary = (upd?.payload as { summary: Record<string, unknown> }).summary;
    const annotations = summary.annotations as unknown[];
    expect(annotations).toHaveLength(2);
    expect(annotations[0]).toEqual(existing);
    expect(annotations[1]).toEqual({ kind: "interval_override", fromSec: 15, toSec: 30, at: NOW });
    expect((annotations[1] as Record<string, unknown>).sessionId).toBeUndefined();
    expect(summary.keep).toBe("z");
  });

  it("creates the annotations array when absent", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "sessions" && s.verb === "select")
        return { data: { summary: { snapshot: { phase: "ended" } } }, error: null };
      return { data: null, error: null };
    });
    mockUser(client);
    await annotateSessionAction({ sessionId: SESSION_ID, kind: "answer_card", at: NOW });
    const upd = calls.find((c) => c.table === "sessions" && c.verb === "update");
    const summary = (upd?.payload as { summary: Record<string, unknown> }).summary;
    expect(summary.annotations).toEqual([{ kind: "answer_card", at: NOW }]);
    expect(summary.snapshot).toEqual({ phase: "ended" });
  });
});

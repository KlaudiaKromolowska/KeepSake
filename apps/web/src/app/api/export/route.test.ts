import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

// resolveActivePatient reads the active-patient cookie from next/headers.
const { cookiesMock, setActiveCookie } = vi.hoisted(() => {
  let active: string | undefined;
  return {
    cookiesMock: vi.fn(async () => ({
      get: (_name: string) => (active ? { value: active } : undefined),
    })),
    setActiveCookie: (v: string | undefined) => {
      active = v;
    },
  };
});
vi.mock("next/headers", () => ({ cookies: cookiesMock }));

import { GET } from "./route";

/** Chainable query stub: every filter returns `this`; awaiting or maybeSingle yields `result`. */
function query(result: { data: unknown; error: unknown }) {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit", "insert"])
    p[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return p;
    };
  p.maybeSingle = async () => result;
  // biome-ignore lint/suspicious/noThenProperty: supabase query builders ARE thenables — the stub must be awaitable exactly like the real client.
  p.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return p;
}

let calls: { method: string; args: unknown[] }[] = [];

interface FakeOpts {
  user?: { id: string } | null;
  patient?: { data: unknown; error: unknown };
  tables?: Record<string, { data: unknown; error: unknown }>;
}

function fakeSupabase(opts: FakeOpts) {
  // patients read returns an ARRAY (listOwnedPatients maps over it, oldest first).
  const patient = opts.patient ?? {
    data: [{ id: "p1", display_name: "Pat", timezone: "UTC", etiology: "alzheimers" }],
    error: null,
  };
  const defaults: Record<string, { data: unknown; error: unknown }> = {
    targets: { data: [], error: null },
    sessions: { data: [], error: null },
    trials: { data: [], error: null },
    audit_log: { data: null, error: null },
  };
  const tables = { ...defaults, ...opts.tables };
  const from = vi.fn((table: string) => {
    calls.push({ method: "from", args: [table] });
    return table === "patients" ? query(patient) : query(tables[table]);
  });
  const getUser = vi.fn(async () => ({
    data: { user: opts.user === undefined ? { id: "u1" } : opts.user },
    error: null,
  }));
  return { from, auth: { getUser } };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  setActiveCookie(undefined);
  createClientMock.mockResolvedValue(fakeSupabase({}));
});
afterEach(() => vi.restoreAllMocks());

describe("GET /api/export — auth gating", () => {
  it("401 when there is no signed-in user", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ user: null }));
    const res = await GET();
    expect(res.status).toBe(401);
    // No patient/target/trial reads should happen before the auth check passes.
    expect(calls.some((c) => c.method === "from" && c.args[0] === "targets")).toBe(false);
  });

  it("404 when the caller has no patient/data yet", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ patient: { data: [], error: null } }));
    expect((await GET()).status).toBe(404);
  });

  it("404 when the patient read errors (resolveActivePatient collapses error → no active patient)", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({ patient: { data: null, error: { message: "boom" } } }),
    );
    expect((await GET()).status).toBe(404);
  });

  it("503 when a downstream read errors", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({ tables: { sessions: { data: null, error: { message: "boom" } } } }),
    );
    expect((await GET()).status).toBe(503);
  });
});

describe("GET /api/export — CSV content and headers", () => {
  const targets = [{ id: "t1", question: "grandson's name" }];
  const sessions = [
    { id: "s1", started_at: "2026-07-01T08:00:00.000Z", affect_pre: "content", affect_post: null },
  ];
  const trials = [
    {
      id: "tr1",
      session_id: "s1",
      target_id: "t1",
      interval_sec: 30,
      outcome: "recall",
      is_screening: false,
      corrected: false,
      latency_ms: 900,
      at: "2026-07-01T08:00:05.000Z",
    },
  ];

  beforeEach(() => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        tables: {
          targets: { data: targets, error: null },
          sessions: { data: sessions, error: null },
          trials: { data: trials, error: null },
        },
      }),
    );
  });

  it("returns a CSV attachment with the header row and one row per trial", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain(".csv");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.text();
    const lines = body.trim().split("\r\n");
    expect(lines[0]).toBe(
      "trial_id,session_id,session_started_at,target_id,target_question,outcome,interval_sec,is_screening,corrected,latency_ms,affect_pre,affect_post,trial_at",
    );
    expect(lines[1]).toBe(
      "tr1,s1,2026-07-01T08:00:00.000Z,t1,grandson's name,recall,30,false,false,900,content,,2026-07-01T08:00:05.000Z",
    );
    expect(lines).toHaveLength(2);
  });

  it("scopes every table read to the caller's own patient id (RLS-shaped query surface)", async () => {
    await GET();
    const eqCalls = calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["patient_id", "p1"] });
    // trials are scoped through the patient's own session ids, never queried unfiltered.
    const inCalls = calls.filter((c) => c.method === "in");
    expect(inCalls).toContainEqual({ method: "in", args: ["session_id", ["s1"]] });
  });

  it("exports the ACTIVE (cookie-selected) patient, not the oldest owned one", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        patient: {
          data: [
            { id: "p_old", display_name: "Old", timezone: "UTC", etiology: "alzheimers" },
            { id: "p_new", display_name: "New", timezone: "UTC", etiology: "alzheimers" },
          ],
          error: null,
        },
        tables: {
          targets: { data: targets, error: null },
          sessions: { data: sessions, error: null },
          trials: { data: trials, error: null },
        },
      }),
    );
    setActiveCookie("p_new");
    await GET();
    const eqCalls = calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["patient_id", "p_new"] });
    expect(eqCalls).not.toContainEqual({ method: "eq", args: ["patient_id", "p_old"] });
  });

  it("writes a best-effort data_export audit_log row for the caller's own caregiver_id", async () => {
    await GET();
    const insertCall = calls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.args[0]).toMatchObject({ caregiver_id: "u1", action: "data_export" });
  });

  it("still returns the CSV when the audit_log insert fails", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        tables: {
          targets: { data: targets, error: null },
          sessions: { data: sessions, error: null },
          trials: { data: trials, error: null },
          audit_log: { data: null, error: { message: "boom" } },
        },
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns just the header row when the patient has no trials yet", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({}));
    const res = await GET();
    const body = await res.text();
    expect(body.trim().split("\r\n")).toHaveLength(1);
  });
});

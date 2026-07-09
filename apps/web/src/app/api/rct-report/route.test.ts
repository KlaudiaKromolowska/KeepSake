import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the AI core (quota) and the agentic report runner: no network, no key, no loop.
const { assertAiQuotaMock, QuotaErrorClass } = vi.hoisted(() => {
  class QuotaErrorClass extends Error {}
  return { assertAiQuotaMock: vi.fn(async () => undefined), QuotaErrorClass };
});
vi.mock("@/lib/ai/core", () => ({
  assertAiQuota: assertAiQuotaMock,
  QuotaError: QuotaErrorClass,
}));

const { runRctReportMock } = vi.hoisted(() => ({ runRctReportMock: vi.fn() }));
vi.mock("@/lib/ai/rct-report", () => ({ runRctReport: runRctReportMock }));

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

import { POST } from "./route";

/** Chainable query stub: every filter returns `this`; awaiting or maybeSingle yields `result`. */
function query(result: { data: unknown; error: unknown }) {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) p[m] = () => p;
  p.maybeSingle = async () => result;
  p.single = async () => result;
  // biome-ignore lint/suspicious/noThenProperty: supabase query builders ARE thenables — the stub must be awaitable exactly like the real client.
  p.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return p;
}

interface FakeOpts {
  user?: { id: string } | null;
  patient?: { data: unknown; error: unknown };
  tables?: Record<string, { data: unknown; error: unknown }>;
}

function fakeSupabase(opts: FakeOpts) {
  // patients read returns an ARRAY (listOwnedPatients maps over it, oldest first).
  const patient = opts.patient ?? {
    data: [{ id: "p1", display_name: "Marta", etiology: "alzheimers", timezone: "Europe/Warsaw" }],
    error: null,
  };
  const defaults: Record<string, { data: unknown; error: unknown }> = {
    targets: { data: [], error: null },
    target_state: { data: [], error: null },
    sessions: { data: [], error: null },
    trials: { data: [], error: null },
  };
  const tables = { ...defaults, ...opts.tables };
  const from = vi.fn((table: string) =>
    table === "patients" ? query(patient) : query(tables[table]),
  );
  const getUser = vi.fn(async () => ({
    data: { user: opts.user === undefined ? { id: "u1" } : opts.user },
    error: null,
  }));
  return { from, auth: { getUser } };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/rct-report", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setActiveCookie(undefined);
  assertAiQuotaMock.mockResolvedValue(undefined);
  runRctReportMock.mockResolvedValue({
    report: "## Summary\nok",
    trail: [{ tool: "get_trial_counts", description: "Counted trials and outcomes per session" }],
  });
  createClientMock.mockResolvedValue(fakeSupabase({}));
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/rct-report — input validation", () => {
  it("400 on invalid JSON body", async () => {
    expect((await POST(post("not json{"))).status).toBe(400);
  });

  it("400 when the question is too short / too long / has extra keys", async () => {
    expect((await POST(post({ question: "hi" }))).status).toBe(400);
    expect((await POST(post({ question: "x".repeat(301) }))).status).toBe(400);
    expect((await POST(post({ question: "valid question here", evil: true }))).status).toBe(400);
  });

  it("does not run quota or the report on invalid input", async () => {
    await POST(post({ question: "hi" }));
    expect(assertAiQuotaMock).not.toHaveBeenCalled();
    expect(runRctReportMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/rct-report — auth & quota", () => {
  it("401 when there is no signed-in user", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ user: null }));
    const res = await POST(post({ question: "What is the acquisition rate?" }));
    expect(res.status).toBe(401);
    expect(runRctReportMock).not.toHaveBeenCalled();
  });

  it("429 when the quota is exhausted (one 'rct' unit per report)", async () => {
    assertAiQuotaMock.mockRejectedValue(new QuotaErrorClass("limit reached"));
    const res = await POST(post({ question: "What is the acquisition rate?" }));
    expect(res.status).toBe(429);
    expect(assertAiQuotaMock).toHaveBeenCalledWith(expect.anything(), "rct");
    expect(runRctReportMock).not.toHaveBeenCalled();
  });

  it("404 when the caller has no patient/data", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ patient: { data: [], error: null } }));
    const res = await POST(post({ question: "What is the acquisition rate?" }));
    expect(res.status).toBe(404);
  });

  it("analyzes the ACTIVE (cookie-selected) patient, not the oldest owned one", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        patient: {
          data: [
            {
              id: "p_old",
              display_name: "Marta",
              etiology: "alzheimers",
              timezone: "Europe/Warsaw",
            },
            {
              id: "p_new",
              display_name: "Nowak",
              etiology: "alzheimers",
              timezone: "Europe/Warsaw",
            },
          ],
          error: null,
        },
      }),
    );
    setActiveCookie("p_new");
    const res = await POST(post({ question: "What is the acquisition rate?" }));
    expect(res.status).toBe(200);
    // The report context must carry the ACTIVE patient's name, not the oldest patient's.
    const opts = runRctReportMock.mock.calls[0][0];
    expect(opts.context).toContain("PATIENT: Nowak");
    expect(opts.context).not.toContain("PATIENT: Marta");
  });
});

describe("POST /api/rct-report — success", () => {
  it("returns JSON { report, trail } and runs the agent over the caller's context", async () => {
    const res = await POST(post({ question: "What is the acquisition rate?" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { report: string; trail: unknown[] };
    expect(body.report).toContain("## Summary");
    expect(body.trail).toHaveLength(1);

    const opts = runRctReportMock.mock.calls[0][0];
    expect(opts.question).toBe("What is the acquisition rate?");
    expect(opts.locale).toBe("en");
    // Data minimization: display_name reaches the prompt context; the untrusted question is separate.
    expect(opts.context).toContain("PATIENT: Marta");
    expect(opts.data).toBeDefined();
  });

  it("503 when a data read fails", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({ tables: { sessions: { data: null, error: { message: "boom" } } } }),
    );
    expect((await POST(post({ question: "What is the acquisition rate?" }))).status).toBe(503);
  });

  it("503 when the agentic report fails", async () => {
    runRctReportMock.mockRejectedValue(new Error("model unavailable"));
    expect((await POST(post({ question: "What is the acquisition rate?" }))).status).toBe(503);
  });
});

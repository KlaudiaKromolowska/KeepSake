import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// requireUser is the (app) layout's auth boundary; the page trusts it and never talks to
// next/navigation directly, so mocking it here (not the raw supabase client) matches how the page
// is actually wired and keeps the fake query surface small.
const { requireUserMock } = vi.hoisted(() => ({ requireUserMock: vi.fn() }));
vi.mock("@/lib/actions", () => ({ requireUser: requireUserMock }));
// The page resolves the ACTIVE patient (multi-patient) via a cookie; with no cookie it falls back
// to the caregiver's oldest owned patient. Stub next/headers so that fallback path runs.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

import TrendsPage from "./page";

/** Chainable query stub: every filter returns `this`; awaiting or maybeSingle yields `result`. */
function query(result: { data: unknown; error: unknown }) {
  const p: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) p[m] = () => p;
  p.maybeSingle = async () => result;
  // biome-ignore lint/suspicious/noThenProperty: supabase query builders ARE thenables — the stub must be awaitable exactly like the real client.
  p.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return p;
}

interface FakeOpts {
  patient?: { data: unknown; error: unknown };
  tables?: Record<string, { data: unknown; error: unknown }>;
}

function fakeSupabase(opts: FakeOpts) {
  const patient = opts.patient ?? {
    data: { id: "p1", display_name: "Maria", timezone: "Europe/Warsaw", etiology: "alzheimers" },
    error: null,
  };
  // listOwnedPatients (the active-patient resolver) reads the caregiver's patients as a LIST, so
  // the patients query resolves to an array; a single object becomes a one-element roster.
  const patientsResult = {
    data: patient.data == null ? patient.data : [patient.data],
    error: patient.error,
  };
  const defaults: Record<string, { data: unknown; error: unknown }> = {
    targets: { data: [], error: null },
    sessions: { data: [], error: null },
    trials: { data: [], error: null },
  };
  const tables = { ...defaults, ...opts.tables };
  return {
    from: (table: string) => (table === "patients" ? query(patientsResult) : query(tables[table])),
  };
}

async function renderPage() {
  const el = await TrendsPage();
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ user: { id: "u1" }, supabase: fakeSupabase({}) });
});
afterEach(() => vi.restoreAllMocks());

describe("TrendsPage — empty/error states", () => {
  it("shows the no-target message when there is no patient yet", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: fakeSupabase({ patient: { data: null, error: null } }),
    });
    expect(await renderPage()).toContain("Create a memory target");
  });

  it("shows the no-target message when the patient has no practicable target", async () => {
    const html = await renderPage();
    expect(html).toContain("Create a memory target");
  });

  it("degrades to the no-target state on a patient read error", async () => {
    // The active-patient resolver treats a patients read failure as "no patient" (best-effort,
    // like loadQueue) rather than surfacing a raw error — the caregiver sees the empty state.
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: fakeSupabase({ patient: { data: null, error: { message: "boom" } } }),
    });
    expect(await renderPage()).toContain("Create a memory target");
  });

  it("shows the unavailable message on a trials read error", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: fakeSupabase({
        tables: {
          targets: { data: [{ id: "t1", question: "granddaughter's name" }], error: null },
          trials: { data: null, error: { message: "boom" } },
        },
      }),
    });
    expect(await renderPage()).toContain("Trends aren&#x27;t available right now");
  });
});

describe("TrendsPage — populated data", () => {
  const targets = [{ id: "t1", question: "granddaughter's name" }];
  const sessions = [
    {
      id: "s1",
      started_at: "2026-07-03T07:00:00.000Z",
      affect_pre: "content",
      affect_post: "unsettled",
    },
  ];
  const trials = [
    {
      session_id: "s1",
      target_id: "t1",
      interval_sec: 15,
      outcome: "recall",
      is_screening: false,
      at: "2026-07-03T07:00:01.000Z",
    },
  ];

  beforeEach(() => {
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: fakeSupabase({
        tables: {
          targets: { data: targets, error: null },
          sessions: { data: sessions, error: null },
          trials: { data: trials, error: null },
        },
      }),
    });
  });

  it("renders the wellness-safe disclaimer and self-referenced framing", async () => {
    const html = await renderPage();
    expect(html).toContain("Learning-dynamics trends");
    expect(html).toContain("compared only to this person&#x27;s own earlier sessions");
    expect(html).toContain("It is not a diagnosis");
    expect(html).toContain("not a medical device"); // SiteFooter
  });

  it("never names the disease in-product", async () => {
    const html = await renderPage();
    expect(html.toLowerCase()).not.toMatch(/dementia|alzheimer/);
  });

  it("renders the ladder-progress band chart and the target's retention chart", async () => {
    const html = await renderPage();
    expect(html).toContain("Ladder progress, all targets");
    expect(html).toContain("granddaughter&#x27;s name");
    expect(html).toContain("Item retention, per target");
  });

  it("renders the affect two-tap chart when check-ins were captured", async () => {
    const html = await renderPage();
    expect(html).toContain("Mood around practice");
    expect(html).toContain("check-in");
  });

  it("falls back to the affect-empty state when no session captured a tap", async () => {
    requireUserMock.mockResolvedValue({
      user: { id: "u1" },
      supabase: fakeSupabase({
        tables: {
          targets: { data: targets, error: null },
          sessions: {
            data: [
              {
                id: "s1",
                started_at: "2026-07-03T07:00:00.000Z",
                affect_pre: null,
                affect_post: null,
              },
            ],
            error: null,
          },
          trials: { data: trials, error: null },
        },
      }),
    });
    const html = await renderPage();
    expect(html).toContain("No mood check-ins recorded yet");
  });
});

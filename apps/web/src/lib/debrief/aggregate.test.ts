import { describe, expect, it } from "vitest";
import { fetchDebriefAggregate, toDebriefAggregate } from "./aggregate";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("toDebriefAggregate", () => {
  const trials = [
    { interval_sec: 0, outcome: "recall" },
    { interval_sec: 15, outcome: "miss" },
    { interval_sec: 15, outcome: "recall" },
    { interval_sec: 30, outcome: "unclear" },
  ];

  it("maps counts, rung sequence, note, and stats from summary + trials", () => {
    const summary = {
      note: "  She lit up remembering the name.  ",
      annotations: [
        { kind: "interval_override", fromSec: 15, toSec: 30, at: 1 },
        { kind: "answer_card", note: "photo", at: 2 },
      ],
      stats: { endReason: "caregiver", rescopeRequired: false },
    };

    const aggregate = toDebriefAggregate(summary, trials, "Grandma Ana");

    expect(aggregate.patientDisplayName).toBe("Grandma Ana");
    expect(aggregate.locale).toBe("en");
    expect(aggregate.trialCount).toBe(4);
    expect(aggregate.recalls).toBe(2);
    expect(aggregate.misses).toBe(1);
    expect(aggregate.unclears).toBe(1);
    expect(aggregate.rungSequenceSec).toEqual([0, 15, 15, 30]);
    // Only interval_override annotations become overrides — answer_card is excluded.
    expect(aggregate.overrideAnnotations).toEqual([{ fromSec: 15, toSec: 30 }]);
    expect(aggregate.note).toBe("  She lit up remembering the name.  ");
    expect(aggregate.mastered).toBe(false);
    expect(aggregate.rescopeRequired).toBe(false);
  });

  it("mastered + rescope flags read from stats; missing summary fields default safely", () => {
    const aggregate = toDebriefAggregate(
      { stats: { endReason: "mastered", rescopeRequired: true } },
      trials,
      "Grandma Ana",
    );
    expect(aggregate.mastered).toBe(true);
    expect(aggregate.rescopeRequired).toBe(true);
    expect(aggregate.note).toBeNull();
    expect(aggregate.overrideAnnotations).toEqual([]);
  });

  it("null/non-object summary → empty-safe defaults, no throw", () => {
    const aggregate = toDebriefAggregate(null, [], "Grandma Ana");
    expect(aggregate.trialCount).toBe(0);
    expect(aggregate.note).toBeNull();
    expect(aggregate.mastered).toBe(false);
    expect(aggregate.overrideAnnotations).toEqual([]);
  });
});

/** Chainable, thenable Supabase stub mirroring lib/session/actions.test.ts's makeSupabase. */
interface CallState {
  table: string;
  filters: Record<string, unknown>;
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
      select() {
        return b;
      },
      eq(k: string, v: unknown) {
        state.filters[k] = v;
        return b;
      },
      order() {
        return b;
      },
      single() {
        return Promise.resolve(exec());
      },
      // biome-ignore lint/suspicious/noThenProperty: mirrors the real thenable Supabase query builder.
      then<R>(onF: (v: { data: unknown; error: unknown }) => R) {
        return Promise.resolve(exec()).then(onF);
      },
    };
    return b;
  }
  return { client: { from: builder } as unknown, calls };
}

describe("fetchDebriefAggregate", () => {
  it("session not found (or not the caller's, per RLS) → not_found, no further reads", async () => {
    const { client, calls } = makeSupabase(() => ({ data: null, error: null }));
    const result = await fetchDebriefAggregate(client as never, SESSION_ID);
    expect(result).toEqual({ data: null, error: "not_found" });
    expect(calls).toHaveLength(1);
  });

  it("session not yet ended → not_ended, no trial/patient reads", async () => {
    const { client, calls } = makeSupabase((s) => {
      if (s.table === "sessions")
        return { data: { ended_at: null, summary: {}, patient_id: "p-1" }, error: null };
      return { data: null, error: null };
    });
    const result = await fetchDebriefAggregate(client as never, SESSION_ID);
    expect(result).toEqual({ data: null, error: "not_ended" });
    expect(calls).toHaveLength(1);
  });

  it("trials read error → db_error (fail closed)", async () => {
    const { client } = makeSupabase((s) => {
      if (s.table === "sessions")
        return {
          data: { ended_at: "2026-07-08T00:00:00Z", summary: {}, patient_id: "p-1" },
          error: null,
        };
      if (s.table === "trials") return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });
    const result = await fetchDebriefAggregate(client as never, SESSION_ID);
    expect(result).toEqual({ data: null, error: "db_error" });
  });

  it("patient read error → db_error", async () => {
    const { client } = makeSupabase((s) => {
      if (s.table === "sessions")
        return {
          data: { ended_at: "2026-07-08T00:00:00Z", summary: {}, patient_id: "p-1" },
          error: null,
        };
      if (s.table === "trials") return { data: [], error: null };
      if (s.table === "patients") return { data: null, error: { message: "boom" } };
      return { data: null, error: null };
    });
    const result = await fetchDebriefAggregate(client as never, SESSION_ID);
    expect(result).toEqual({ data: null, error: "db_error" });
  });

  it("happy path → builds the aggregate from session + trials + patient display_name", async () => {
    const { client } = makeSupabase((s) => {
      if (s.table === "sessions")
        return {
          data: {
            ended_at: "2026-07-08T00:00:00Z",
            summary: {
              note: "great session",
              stats: { endReason: "caregiver", rescopeRequired: false },
            },
            patient_id: "p-1",
          },
          error: null,
        };
      if (s.table === "trials")
        return {
          data: [
            { interval_sec: 0, outcome: "recall" },
            { interval_sec: 15, outcome: "recall" },
          ],
          error: null,
        };
      if (s.table === "patients") return { data: { display_name: "Grandma Ana" }, error: null };
      return { data: null, error: null };
    });
    const result = await fetchDebriefAggregate(client as never, SESSION_ID);
    expect(result.error).toBeNull();
    expect(result.data?.patientDisplayName).toBe("Grandma Ana");
    expect(result.data?.recalls).toBe(2);
    expect(result.data?.note).toBe("great session");
  });
});

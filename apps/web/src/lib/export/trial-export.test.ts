import { describe, expect, it } from "vitest";
import { buildTrialCsvRows, TRIAL_CSV_HEADER } from "./trial-export";

const targets = [
  { id: "t1", question: "grandson's name" },
  { id: "t2", question: "what year is it" },
];
const sessions = [
  { id: "s1", started_at: "2026-07-01T08:00:00.000Z", affect_pre: "content", affect_post: null },
];

describe("buildTrialCsvRows", () => {
  it("maps one row per trial in the header's column order", () => {
    const rows = buildTrialCsvRows({
      targets,
      sessions,
      trials: [
        {
          id: "tr1",
          session_id: "s1",
          target_id: "t1",
          interval_sec: 30,
          outcome: "recall",
          is_screening: false,
          corrected: false,
          latency_ms: 1200,
          at: "2026-07-01T08:00:05.000Z",
        },
      ],
    });

    expect(rows).toEqual([
      [
        "tr1",
        "s1",
        "2026-07-01T08:00:00.000Z",
        "t1",
        "grandson's name",
        "recall",
        30,
        false,
        false,
        1200,
        "content",
        null,
        "2026-07-01T08:00:05.000Z",
      ],
    ]);
    expect(rows[0]).toHaveLength(TRIAL_CSV_HEADER.length);
  });

  it("falls back to an empty question when the target row is missing", () => {
    const rows = buildTrialCsvRows({
      targets: [],
      sessions,
      trials: [
        {
          id: "tr1",
          session_id: "s1",
          target_id: "missing",
          interval_sec: 10,
          outcome: "miss",
          is_screening: false,
          corrected: true,
          latency_ms: null,
          at: "2026-07-01T08:00:05.000Z",
        },
      ],
    });
    expect(rows[0][4]).toBe("");
    expect(rows[0][9]).toBeNull(); // latency_ms passed through as null, not coerced
  });

  it("drops a trial whose session id has no matching session row (defensive join guard)", () => {
    const rows = buildTrialCsvRows({
      targets,
      sessions,
      trials: [
        {
          id: "tr-orphan",
          session_id: "not-in-sessions",
          target_id: "t1",
          interval_sec: 10,
          outcome: "recall",
          is_screening: false,
          corrected: false,
          latency_ms: null,
          at: "2026-07-01T08:00:05.000Z",
        },
      ],
    });
    expect(rows).toEqual([]);
  });

  it("preserves trial order (caller sorts by `at` ascending)", () => {
    const rows = buildTrialCsvRows({
      targets,
      sessions,
      trials: [
        {
          id: "tr2",
          session_id: "s1",
          target_id: "t2",
          interval_sec: 60,
          outcome: "unclear",
          is_screening: false,
          corrected: false,
          latency_ms: null,
          at: "2026-07-01T08:01:00.000Z",
        },
        {
          id: "tr1",
          session_id: "s1",
          target_id: "t1",
          interval_sec: 30,
          outcome: "recall",
          is_screening: true,
          corrected: false,
          latency_ms: 900,
          at: "2026-07-01T08:00:05.000Z",
        },
      ],
    });
    expect(rows.map((r) => r[0])).toEqual(["tr2", "tr1"]);
  });

  it("returns no rows for a patient with no trials yet", () => {
    expect(buildTrialCsvRows({ targets, sessions: [], trials: [] })).toEqual([]);
  });
});

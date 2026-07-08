import { describe, expect, it } from "vitest";
import {
  describeRctToolCall,
  getAffectSummary,
  getBoosterHistory,
  getIntervalProgression,
  getRetentionAtSessionStart,
  getTrialCounts,
  RCT_TOOL_DEFINITIONS,
  type RctAnalyticsData,
  runRctTool,
} from "./rct-tools";

// Two-session fixture: S1 screens then climbs; S2 opens with a miss, reverts, recovers.
const data: RctAnalyticsData = {
  sessions: [
    { index: 1, date: "2026-07-03", affectPre: "content", affectPost: "content" },
    { index: 2, date: "2026-07-04", affectPre: "unsettled", affectPost: null },
  ],
  targets: [
    {
      index: 1,
      lastSuccessIntervalSec: 33.75,
      startStreak: 1,
      badSessions: 0,
      sessionCount: 2,
      mastered: false,
      scheduleMode: "between",
      betweenSessionGapDays: 1,
      boosterStep: null,
      nextDueAt: "2026-07-05",
    },
  ],
  trials: [
    {
      sessionIndex: 1,
      targetIndex: 1,
      intervalSec: 0,
      outcome: "recall",
      corrected: true,
      isScreening: true,
    },
    {
      sessionIndex: 1,
      targetIndex: 1,
      intervalSec: 15,
      outcome: "recall",
      corrected: false,
      isScreening: false,
    },
    {
      sessionIndex: 1,
      targetIndex: 1,
      intervalSec: 22.5,
      outcome: "recall",
      corrected: false,
      isScreening: false,
    },
    {
      sessionIndex: 2,
      targetIndex: 1,
      intervalSec: 33.75,
      outcome: "miss",
      corrected: true,
      isScreening: false,
    },
    {
      sessionIndex: 2,
      targetIndex: 1,
      intervalSec: 22.5,
      outcome: "recall",
      corrected: false,
      isScreening: false,
    },
    {
      sessionIndex: 2,
      targetIndex: 1,
      intervalSec: 33.75,
      outcome: "unclear",
      corrected: false,
      isScreening: false,
    },
  ],
};

describe("getTrialCounts", () => {
  it("breaks each session down by outcome plus corrected/screening", () => {
    const out = getTrialCounts(data);
    expect(out).toEqual([
      {
        session: 1,
        date: "2026-07-03",
        trials: 3,
        recall: 3,
        miss: 0,
        unclear: 0,
        corrected: 1,
        screening: 1,
      },
      {
        session: 2,
        date: "2026-07-04",
        trials: 3,
        recall: 1,
        miss: 1,
        unclear: 1,
        corrected: 1,
        screening: 0,
      },
    ]);
  });
});

describe("getIntervalProgression", () => {
  it("reports the best NON-screening recalled interval and the last interval per session", () => {
    const out = getIntervalProgression(data);
    // S1 best recalled non-screening = 22.5 (the 0s recall is a screen, excluded); last = 22.5.
    expect(out[0]).toEqual({
      session: 1,
      date: "2026-07-03",
      maxRecalledIntervalSec: 22.5,
      lastIntervalSec: 22.5,
    });
    // S2 best recalled = 22.5; last trial = 33.75 (the unclear).
    expect(out[1]).toEqual({
      session: 2,
      date: "2026-07-04",
      maxRecalledIntervalSec: 22.5,
      lastIntervalSec: 33.75,
    });
  });

  it("returns null max when a session has no clean recall", () => {
    const empty: RctAnalyticsData = {
      sessions: [{ index: 1, date: "d", affectPre: null, affectPost: null }],
      targets: [],
      trials: [
        {
          sessionIndex: 1,
          targetIndex: 1,
          intervalSec: 5,
          outcome: "miss",
          corrected: true,
          isScreening: false,
        },
      ],
    };
    expect(getIntervalProgression(empty)[0].maxRecalledIntervalSec).toBeNull();
  });
});

describe("getRetentionAtSessionStart", () => {
  it("returns the session-start probe outcome/interval (the mastery signal)", () => {
    const out = getRetentionAtSessionStart(data);
    expect(out[0]).toMatchObject({ session: 1, startOutcome: "recall", startIntervalSec: 0 });
    expect(out[1]).toMatchObject({
      session: 2,
      startOutcome: "miss",
      startIntervalSec: 33.75,
      corrected: true,
    });
  });
});

describe("getBoosterHistory", () => {
  it("returns per-target schedule + mastery state by index (no names)", () => {
    const out = getBoosterHistory(data);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      target: 1,
      scheduleMode: "between",
      betweenSessionGapDays: 1,
      startStreak: 1,
      mastered: false,
    });
    expect(JSON.stringify(out)).not.toContain("Lena");
  });

  it("scopes to one target when given an index", () => {
    expect(getBoosterHistory(data, 99)).toEqual([]);
    expect(getBoosterHistory(data, 1)).toHaveLength(1);
  });
});

describe("getAffectSummary", () => {
  it("tallies pre/post two-tap counts and skips", () => {
    const out = getAffectSummary(data);
    expect(out).toEqual({
      available: true,
      sessions: 2,
      pre: { content: 1, unsettled: 1, skipped: 0 },
      post: { content: 1, unsettled: 0, skipped: 1 },
    });
  });

  it("reports available:false when no taps were captured", () => {
    const noTaps: RctAnalyticsData = {
      sessions: [{ index: 1, date: "d", affectPre: null, affectPost: null }],
      targets: [],
      trials: [],
    };
    expect(getAffectSummary(noTaps)).toEqual({ available: false });
  });
});

describe("runRctTool + tool menu", () => {
  it("dispatches a known tool with validated input", () => {
    expect(runRctTool(data, "get_trial_counts", {})).toHaveLength(2);
    expect(runRctTool(data, "get_booster_history", { target: 1 })).toHaveLength(1);
  });

  it("throws on an unknown tool or invalid input", () => {
    expect(() => runRctTool(data, "drop_table", {})).toThrow(/unknown tool/);
    expect(() => runRctTool(data, "get_booster_history", { target: -1 })).toThrow(/invalid input/);
    expect(() => runRctTool(data, "get_trial_counts", { evil: true })).toThrow(/invalid input/);
  });

  it("exposes a fixed menu of five tools, all with locked-down input schemas", () => {
    expect(RCT_TOOL_DEFINITIONS.map((t) => t.name)).toEqual([
      "get_trial_counts",
      "get_interval_progression",
      "get_retention_at_session_start",
      "get_booster_history",
      "get_affect_summary",
    ]);
    for (const def of RCT_TOOL_DEFINITIONS) {
      expect((def.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(
        false,
      );
    }
  });
});

describe("describeRctToolCall — trail assembly", () => {
  it("produces a human-readable one-liner, target-scoped when given an index", () => {
    expect(describeRctToolCall("get_trial_counts", {})).toBe(
      "Counted trials and outcomes per session",
    );
    expect(describeRctToolCall("get_booster_history", { target: 2 })).toBe(
      "Read the between-session schedule and booster state for target T2",
    );
  });
});

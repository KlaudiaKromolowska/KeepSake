import { defaultsForEtiology, nextIntervalSec, startSession } from "@keepsake/core/sr";
import { describe, expect, it } from "vitest";
import {
  annotateSessionInputSchema,
  saveSessionAffectInputSchema,
  saveSessionNoteInputSchema,
  sessionStateSchema,
  targetProgressSchema,
  trialRecordSchema,
} from "./schema";

const config = defaultsForEtiology("alzheimers").config;

// The alzheimers etiology default (growthFactor 1.5) produces fractional ladder rungs
// (15 → 22.5 → ...). Derived from the real config so this test breaks if the defaults change
// and stop exercising the non-integer case — regression for the fractional-rung save drop.
const fractionalRungSec = nextIntervalSec(config.baseIntervalSec, config);

function freshState() {
  return startSession(
    {
      lastSuccessSec: null,
      startStreak: 0,
      lastStartSuccessDay: null,
      badSessions: 0,
      mastered: false,
      sessionCount: 0,
    },
    { at: 1_700_000_000_000, timeZone: "Europe/Warsaw" },
    config,
  );
}

describe("sessionStateSchema", () => {
  it("round-trips a real SessionState produced by startSession", () => {
    const state = freshState();
    const result = sessionStateSchema.safeParse(state);
    expect(result.success).toBe(true);
  });

  it("round-trips a state carrying trials", () => {
    const state = {
      ...freshState(),
      trials: [
        {
          intervalSec: 15,
          outcome: "recall",
          isScreening: false,
          corrected: false,
          at: 1_700_000_001_000,
        },
      ],
    };
    expect(sessionStateSchema.safeParse(state).success).toBe(true);
  });

  it("rejects extra keys (strict)", () => {
    expect(sessionStateSchema.safeParse({ ...freshState(), rogue: 1 }).success).toBe(false);
  });

  it("rejects negative intervalSec", () => {
    expect(sessionStateSchema.safeParse({ ...freshState(), intervalSec: -1 }).success).toBe(false);
  });

  it("accepts a fractional intervalSec produced by a non-integer growthFactor ladder", () => {
    expect(Number.isInteger(fractionalRungSec)).toBe(false); // guards against config drift
    const state = { ...freshState(), intervalSec: fractionalRungSec };
    expect(sessionStateSchema.safeParse(state).success).toBe(true);
  });

  it("rejects an unknown phase", () => {
    expect(sessionStateSchema.safeParse({ ...freshState(), phase: "paused" }).success).toBe(false);
  });

  it("rejects a malformed startedDay", () => {
    expect(sessionStateSchema.safeParse({ ...freshState(), startedDay: "2026-7-8" }).success).toBe(
      false,
    );
    expect(sessionStateSchema.safeParse({ ...freshState(), startedDay: "not-a-day" }).success).toBe(
      false,
    );
  });

  it("rejects a trials array longer than 500", () => {
    const trial = {
      intervalSec: 15,
      outcome: "recall",
      isScreening: false,
      corrected: false,
      at: 1_700_000_001_000,
    };
    const trials = Array.from({ length: 501 }, () => trial);
    expect(sessionStateSchema.safeParse({ ...freshState(), trials }).success).toBe(false);
    expect(
      sessionStateSchema.safeParse({
        ...freshState(),
        trials: Array.from({ length: 500 }, () => trial),
      }).success,
    ).toBe(true);
  });

  it("rejects a non-integer trial timestamp", () => {
    const state = {
      ...freshState(),
      trials: [
        { intervalSec: 15, outcome: "recall", isScreening: false, corrected: false, at: 1.5 },
      ],
    };
    expect(sessionStateSchema.safeParse(state).success).toBe(false);
  });
});

describe("trialRecordSchema", () => {
  const valid = {
    intervalSec: 15,
    outcome: "recall",
    isScreening: false,
    corrected: false,
    at: 1_700_000_001_000,
  };

  it("accepts a valid trial", () => {
    expect(trialRecordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-positive at", () => {
    expect(trialRecordSchema.safeParse({ ...valid, at: 0 }).success).toBe(false);
  });

  it("rejects an unknown outcome", () => {
    expect(trialRecordSchema.safeParse({ ...valid, outcome: "maybe" }).success).toBe(false);
  });

  it("accepts a fractional intervalSec (alzheimers ladder rung, e.g. 22.5)", () => {
    expect(trialRecordSchema.safeParse({ ...valid, intervalSec: fractionalRungSec }).success).toBe(
      true,
    );
  });
});

describe("targetProgressSchema", () => {
  const valid = {
    lastSuccessSec: null,
    startStreak: 0,
    lastStartSuccessDay: null,
    badSessions: 0,
    mastered: false,
    sessionCount: 0,
  };

  it("accepts a fractional lastSuccessSec (alzheimers ladder rung, e.g. 22.5)", () => {
    const result = targetProgressSchema.safeParse({ ...valid, lastSuccessSec: fractionalRungSec });
    expect(result.success).toBe(true);
  });
});

describe("annotateSessionInputSchema", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";

  it("accepts an answer_card annotation", () => {
    const result = annotateSessionInputSchema.safeParse({
      sessionId,
      kind: "answer_card",
      note: "showed the photo",
      at: 1_700_000_001_000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an interval_override annotation", () => {
    const result = annotateSessionInputSchema.safeParse({
      sessionId,
      kind: "interval_override",
      fromSec: 15,
      toSec: 30,
      at: 1_700_000_001_000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(
      annotateSessionInputSchema.safeParse({ sessionId, kind: "scribble", at: 1_700_000_001_000 })
        .success,
    ).toBe(false);
  });
});

describe("saveSessionNoteInputSchema", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";

  it("accepts a note within the length cap", () => {
    expect(
      saveSessionNoteInputSchema.safeParse({ sessionId, note: "a".repeat(2000) }).success,
    ).toBe(true);
  });

  it("rejects an empty note", () => {
    expect(saveSessionNoteInputSchema.safeParse({ sessionId, note: "" }).success).toBe(false);
  });

  it("rejects a note over the length cap", () => {
    expect(
      saveSessionNoteInputSchema.safeParse({ sessionId, note: "a".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("saveSessionAffectInputSchema", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";

  it("accepts both affect values at both points", () => {
    for (const point of ["pre", "post"] as const) {
      for (const affect of ["content", "unsettled"] as const) {
        expect(saveSessionAffectInputSchema.safeParse({ sessionId, point, affect }).success).toBe(
          true,
        );
      }
    }
  });

  it("rejects any affect outside the two literals", () => {
    for (const affect of ["happy", "sad", 3, "", null]) {
      expect(
        saveSessionAffectInputSchema.safeParse({ sessionId, point: "pre", affect }).success,
      ).toBe(false);
    }
  });

  it("rejects an unknown point and extra keys (strict)", () => {
    expect(
      saveSessionAffectInputSchema.safeParse({ sessionId, point: "mid", affect: "content" })
        .success,
    ).toBe(false);
    expect(
      saveSessionAffectInputSchema.safeParse({
        sessionId,
        point: "pre",
        affect: "content",
        extra: 1,
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed sessionId", () => {
    expect(
      saveSessionAffectInputSchema.safeParse({
        sessionId: "not-a-uuid",
        point: "pre",
        affect: "content",
      }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { buildRctInputs, type RctRawInputs } from "./rct-data";

const raw: RctRawInputs = {
  patient: { display_name: "Marta", etiology: "alzheimers", timezone: "Europe/Warsaw" },
  targets: [
    {
      id: "tgt-a",
      question: "granddaughter's name?",
      answer: "Lena",
      status: "active",
      candidacy: "passed",
    },
  ],
  states: [
    {
      target_id: "tgt-a",
      last_success_interval_sec: 33.75,
      start_streak: 1,
      bad_sessions: 0,
      session_count: 2,
      mastered_at: null,
      schedule_mode: "between",
      between_session_gap_days: 1,
      booster_step: null,
      next_due_at: "2026-07-05T09:00:00.000Z",
    },
  ],
  sessions: [
    { id: "s-1", started_at: "2026-07-03T09:00:00.000Z", affect_pre: "content", affect_post: null },
    {
      id: "s-2",
      started_at: "2026-07-04T09:00:00.000Z",
      affect_pre: null,
      affect_post: "unsettled",
    },
  ],
  trials: [
    {
      session_id: "s-1",
      target_id: "tgt-a",
      interval_sec: 15,
      outcome: "recall",
      corrected: false,
      is_screening: false,
    },
    {
      session_id: "s-2",
      target_id: "tgt-a",
      interval_sec: 33.75,
      outcome: "miss",
      corrected: true,
      is_screening: false,
    },
  ],
};

describe("buildRctInputs", () => {
  it("puts patient identity + config + target roster (only) in the context", () => {
    const { context } = buildRctInputs(raw);
    expect(context).toContain("PATIENT: Marta (etiology: alzheimers)");
    expect(context).toContain('T1: "granddaughter\'s name?" → "Lena"');
    expect(context).toContain("base="); // etiology-tuned config header present
  });

  it("substitutes uuids for 1-based indices and localizes dates to the patient tz", () => {
    const { data } = buildRctInputs(raw);
    expect(data.sessions).toEqual([
      { index: 1, date: "2026-07-03", affectPre: "content", affectPost: null },
      { index: 2, date: "2026-07-04", affectPre: null, affectPost: "unsettled" },
    ]);
    expect(data.trials).toEqual([
      {
        sessionIndex: 1,
        targetIndex: 1,
        intervalSec: 15,
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
    ]);
    expect(data.targets[0]).toMatchObject({
      index: 1,
      scheduleMode: "between",
      nextDueAt: "2026-07-05",
      mastered: false,
    });
  });

  it("emits no uuids or free-text answers into the analytics data (minimization)", () => {
    const { data } = buildRctInputs(raw);
    const json = JSON.stringify(data);
    expect(json).not.toContain("tgt-a");
    expect(json).not.toContain("s-1");
    expect(json).not.toContain("Lena");
  });

  it("drops trials that reference an unknown session or target", () => {
    const orphan: RctRawInputs = {
      ...raw,
      trials: [
        {
          session_id: "ghost",
          target_id: "tgt-a",
          interval_sec: 5,
          outcome: "recall",
          corrected: false,
          is_screening: false,
        },
      ],
    };
    expect(buildRctInputs(orphan).data.trials).toEqual([]);
  });
});

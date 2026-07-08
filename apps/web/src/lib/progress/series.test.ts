import { describe, expect, it } from "vitest";
import {
  type AcquisitionPoint,
  describeAcquisition,
  durationTicks,
  formatDay,
  formatDuration,
  logY,
  toAcquisitionSeries,
} from "./series";

const TZ = "Europe/Warsaw";

// 09:00 Warsaw (CEST, +02:00) on the given July-2026 day — matches the seed's session times.
const at = (day: number, offsetMs = 0) =>
  new Date(Date.UTC(2026, 6, day, 7, 0, 0) + offsetMs).toISOString();

const session = (id: string, day: number) => ({ id, started_at: at(day) });

const trial = (
  sessionId: string,
  intervalSec: number,
  outcome: string,
  opts: { day?: number; offsetMs?: number; screening?: boolean } = {},
) => ({
  session_id: sessionId,
  interval_sec: intervalSec,
  outcome,
  is_screening: opts.screening ?? false,
  at: at(opts.day ?? 1, opts.offsetMs ?? 0),
});

describe("toAcquisitionSeries", () => {
  it("returns [] with no sessions or no trials", () => {
    expect(toAcquisitionSeries([], [], TZ)).toEqual([]);
    expect(toAcquisitionSeries([session("s1", 1)], [], TZ)).toEqual([]);
  });

  it("maps one session to one point: best recall interval, day in patient tz", () => {
    const points = toAcquisitionSeries(
      [session("s1", 3)],
      [
        trial("s1", 15, "recall", { day: 3, offsetMs: 1000 }),
        trial("s1", 22.5, "recall", { day: 3, offsetMs: 2000 }),
        trial("s1", 33.75, "recall", { day: 3, offsetMs: 3000 }),
      ],
      TZ,
    );
    expect(points).toEqual([
      { sessionId: "s1", day: "2026-07-03", bestRecallSec: 33.75, startMiss: false },
    ]);
  });

  it("ignores screening trials and skips sessions with no successful recall", () => {
    const points = toAcquisitionSeries(
      [session("s1", 3), session("s2", 4)],
      [
        // s1: only candidacy screening + an unclear probe — no practice recall, no point.
        trial("s1", 30, "recall", { day: 3, screening: true }),
        trial("s1", 15, "unclear", { day: 3, offsetMs: 1000 }),
        // s2: real practice.
        trial("s2", 15, "recall", { day: 4 }),
      ],
      TZ,
    );
    expect(points).toEqual([
      { sessionId: "s2", day: "2026-07-04", bestRecallSec: 15, startMiss: false },
    ]);
  });

  it("flags a session whose earliest practice trial is a miss (start-probe reminder)", () => {
    const points = toAcquisitionSeries(
      [session("s4", 6)],
      [
        // Deliberately out of order — startMiss must follow `at`, not array order.
        trial("s4", 576.650390625, "recall", { day: 6, offsetMs: 2000 }),
        trial("s4", 864.9755859375, "recall", { day: 6, offsetMs: 3000 }),
        trial("s4", 576.650390625, "miss", { day: 6, offsetMs: 1000 }),
      ],
      TZ,
    );
    expect(points).toEqual([
      { sessionId: "s4", day: "2026-07-06", bestRecallSec: 864.9755859375, startMiss: true },
    ]);
  });

  it("orders points by session start even when sessions arrive shuffled; keeps same-day sessions", () => {
    const points = toAcquisitionSeries(
      [session("s2", 4), session("s1", 3), { id: "s3", started_at: at(4, 3_600_000) }],
      [
        trial("s1", 15, "recall", { day: 3 }),
        trial("s2", 22.5, "recall", { day: 4 }),
        trial("s3", 33.75, "recall", { day: 4, offsetMs: 3_600_000 }),
      ],
      TZ,
    );
    expect(points.map((p) => p.bestRecallSec)).toEqual([15, 22.5, 33.75]);
    expect(points.map((p) => p.day)).toEqual(["2026-07-03", "2026-07-04", "2026-07-04"]);
  });
});

describe("formatDuration", () => {
  it("renders seconds, whole minutes, and mixed durations", () => {
    expect(formatDuration(33.75)).toBe("34 sec");
    expect(formatDuration(75.9375)).toBe("1 min 16 sec");
    expect(formatDuration(960)).toBe("16 min");
    expect(formatDuration(59.6)).toBe("1 min"); // rounds up across the minute boundary
    expect(formatDuration(0)).toBe("0 sec");
  });
});

describe("formatDay", () => {
  it("renders a YYYY-MM-DD day as a short label, falling back to the input when unparsable", () => {
    expect(formatDay("2026-07-03")).toBe("Jul 3");
    expect(formatDay("not-a-day")).toBe("not-a-day");
  });
});

describe("durationTicks", () => {
  it("steps geometrically from the base and always ends at the ceiling", () => {
    expect(durationTicks(15, 960)).toEqual([15, 60, 240, 960]);
    expect(durationTicks(15, 900)).toEqual([15, 60, 240, 900]);
  });

  it("degrades to just the ceiling on nonsensical inputs", () => {
    expect(durationTicks(0, 960)).toEqual([960]);
    expect(durationTicks(960, 960)).toEqual([960]);
  });
});

describe("logY", () => {
  it("maps the domain ends to 0 and 1 and clamps outside it", () => {
    expect(logY(15, 15, 960)).toBe(0);
    expect(logY(960, 15, 960)).toBe(1);
    expect(logY(1, 15, 960)).toBe(0);
    expect(logY(2000, 15, 960)).toBe(1);
    expect(logY(120, 15, 960)).toBeCloseTo(0.5, 2); // 120 = geometric midpoint of 15..960
  });

  it("returns 1 when the domain is degenerate", () => {
    expect(logY(15, 15, 15)).toBe(1);
  });
});

describe("describeAcquisition", () => {
  const point = (day: string, bestRecallSec: number, startMiss = false): AcquisitionPoint => ({
    sessionId: day,
    day,
    bestRecallSec,
    startMiss,
  });

  it("returns null with no points", () => {
    expect(describeAcquisition([], 960)).toBeNull();
  });

  it("describes a single session", () => {
    expect(describeAcquisition([point("2026-07-03", 33.75)], 960)).toBe(
      "In the first practice session (Jul 3), the longest delay recalled was 34 sec.",
    );
  });

  it("describes the seed arc: growth, one reminder session, goal reached", () => {
    const points = [
      point("2026-07-03", 33.75),
      point("2026-07-04", 75.9375),
      point("2026-07-05", 576.650390625),
      point("2026-07-06", 864.9755859375, true),
      point("2026-07-07", 960),
    ];
    expect(describeAcquisition(points, 960)).toBe(
      "Across 5 practice sessions (Jul 3 – Jul 7), the longest delay recalled grew from 34 sec to 16 min. " +
        "1 session began with a quick reminder — a normal part of spaced practice. " +
        "The in-session goal of 16 min has been reached — check-ins now spread out across days.",
    );
  });

  it("frames a recent dip as rebuilding, never as failure", () => {
    const points = [
      point("2026-07-03", 15),
      point("2026-07-04", 240),
      point("2026-07-05", 60, true),
    ];
    const text = describeAcquisition(points, 960);
    expect(text).toBe(
      "Across 3 practice sessions (Jul 3 – Jul 5), the longest delay recalled grew from 15 sec to 1 min. " +
        "The best delay so far is 4 min — dips are a normal part of spaced practice, and the next session rebuilds from a comfortable step. " +
        "1 session began with a quick reminder — a normal part of spaced practice.",
    );
    expect(text).not.toMatch(/fail|wrong|miss/i);
  });

  it("says held steady when the delay is unchanged, and moved when it ends lower than it began", () => {
    expect(describeAcquisition([point("2026-07-03", 60), point("2026-07-04", 60)], 960)).toBe(
      "Across 2 practice sessions (Jul 3 – Jul 4), the longest delay recalled has held steady at 1 min.",
    );
    const text = describeAcquisition([point("2026-07-03", 240), point("2026-07-04", 60)], 960);
    expect(text).toContain(
      "Across 2 practice sessions (Jul 3 – Jul 4), the longest delay recalled has reached 4 min at its best",
    );
    expect(text).not.toMatch(/went from|down to/);
    // The reassurance lives inside the moved sentence — it must not repeat as a second line.
    expect((text ?? "").match(/comfortable step/g)).toHaveLength(1);
  });
});

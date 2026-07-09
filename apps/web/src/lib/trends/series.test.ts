import { describe, expect, it } from "vitest";
import type { AcquisitionPoint } from "@/lib/progress/series";
import {
  type AffectSessionRow,
  currentBand,
  describeAffect,
  toAffectSeries,
  toIntervalBandSeries,
} from "./series";

const point = (day: string, bestRecallSec: number, sessionId = day): AcquisitionPoint => ({
  sessionId,
  day,
  bestRecallSec,
  startMiss: false,
});

describe("toIntervalBandSeries", () => {
  it("returns [] for no points", () => {
    expect(toIntervalBandSeries([], 15, 960)).toEqual([]);
  });

  it("buckets a single point at the base rung", () => {
    const series = toIntervalBandSeries([point("2026-07-03", 15)], 15, 960);
    expect(series).toEqual([
      {
        sessionId: "2026-07-03",
        day: "2026-07-03",
        bandIndex: 0,
        bandLabel: "15 sec",
        totalBands: 4,
      },
    ]);
  });

  it("climbs bands as the recalled interval grows (ticks: 15, 60, 240, 960)", () => {
    const points = [
      point("2026-07-03", 15),
      point("2026-07-04", 33.75), // still under 60 -> band 0
      point("2026-07-05", 75.9375), // >= 60 -> band 1
      point("2026-07-06", 960), // at ceiling -> last band
    ];
    const series = toIntervalBandSeries(points, 15, 960);
    expect(series.map((p) => p.bandIndex)).toEqual([0, 0, 1, 3]);
    expect(series.map((p) => p.bandLabel)).toEqual(["15 sec", "15 sec", "1 min", "16 min"]);
    expect(series.every((p) => p.totalBands === 4)).toBe(true);
  });

  it("never regresses to a negative band on a dip below the base interval (edge case)", () => {
    const series = toIntervalBandSeries([point("2026-07-03", 3)], 15, 960);
    expect(series[0].bandIndex).toBe(0);
  });

  it("degenerate ladder (base >= max) collapses to one band", () => {
    const series = toIntervalBandSeries([point("2026-07-03", 960)], 960, 960);
    expect(series).toEqual([
      {
        sessionId: "2026-07-03",
        day: "2026-07-03",
        bandIndex: 0,
        bandLabel: "16 min",
        totalBands: 1,
      },
    ]);
  });
});

describe("currentBand", () => {
  it("returns null with no points", () => {
    expect(currentBand([], 15, 960)).toBeNull();
  });

  it("reflects the most recent session's band, not the best-ever band", () => {
    const points = [point("2026-07-03", 960), point("2026-07-04", 15)];
    const band = currentBand(points, 15, 960);
    expect(band).toEqual({ bandIndex: 0, bandLabel: "15 sec", totalBands: 4, atGoal: false });
  });

  it("flags atGoal when the latest session reached the ceiling rung", () => {
    const band = currentBand([point("2026-07-03", 960)], 15, 960);
    expect(band).toEqual({ bandIndex: 3, bandLabel: "16 min", totalBands: 4, atGoal: true });
  });
});

const TZ = "Europe/Warsaw";
const session = (
  id: string,
  startedAtIso: string,
  pre: string | null,
  post: string | null,
): AffectSessionRow => ({ id, started_at: startedAtIso, affect_pre: pre, affect_post: post });

describe("toAffectSeries", () => {
  it("returns [] for no sessions", () => {
    expect(toAffectSeries([], TZ)).toEqual([]);
  });

  it("maps a captured tap to a point with the day resolved in the patient timezone", () => {
    const points = toAffectSeries(
      [session("s1", "2026-07-03T07:00:00.000Z", "content", "unsettled")],
      TZ,
    );
    expect(points).toEqual([
      { sessionId: "s1", day: "2026-07-03", pre: "content", post: "unsettled" },
    ]);
  });

  it("drops sessions where both taps were skipped (nothing to plot)", () => {
    const points = toAffectSeries(
      [
        session("s1", "2026-07-03T07:00:00.000Z", null, null),
        session("s2", "2026-07-04T07:00:00.000Z", "content", null),
      ],
      TZ,
    );
    expect(points).toEqual([{ sessionId: "s2", day: "2026-07-04", pre: "content", post: null }]);
  });

  it("orders by session start even when rows arrive shuffled", () => {
    const points = toAffectSeries(
      [
        session("s2", "2026-07-04T07:00:00.000Z", "unsettled", null),
        session("s1", "2026-07-03T07:00:00.000Z", "content", null),
      ],
      TZ,
    );
    expect(points.map((p) => p.sessionId)).toEqual(["s1", "s2"]);
  });

  it("ignores an unrecognized affect value (defensive against future churn)", () => {
    const points = toAffectSeries(
      [session("s1", "2026-07-03T07:00:00.000Z", "neutral", "content")],
      TZ,
    );
    expect(points).toEqual([{ sessionId: "s1", day: "2026-07-03", pre: null, post: "content" }]);
  });
});

describe("describeAffect", () => {
  it("returns null with no points", () => {
    expect(describeAffect([])).toBeNull();
  });

  it("counts a single check-in", () => {
    expect(
      describeAffect([{ sessionId: "s1", day: "2026-07-03", pre: "content", post: null }]),
    ).toBe(
      "Across 1 check-in: before practice, calm 1 time and unsettled 0 times; after practice, calm 0 times and unsettled 0 times.",
    );
  });

  it("counts across several check-ins, pluralizing correctly", () => {
    const points = [
      { sessionId: "s1", day: "2026-07-03", pre: "content" as const, post: "content" as const },
      { sessionId: "s2", day: "2026-07-04", pre: "unsettled" as const, post: "content" as const },
      { sessionId: "s3", day: "2026-07-05", pre: "content" as const, post: "unsettled" as const },
    ];
    expect(describeAffect(points)).toBe(
      "Across 3 check-ins: before practice, calm 2 times and unsettled 1 time; after practice, calm 2 times and unsettled 1 time.",
    );
    expect(describeAffect(points)).not.toMatch(/decline|worse|diagnos/i);
  });
});

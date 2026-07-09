// Pure transformations for the Trends view (/trends, TASKS.md 5.5 / PLAN.md §3.5). Two signals
// not already surfaced elsewhere: (1) interval-band progression — which rung of a target's own
// practice ladder it has most recently reached, distilled from the acquisition series already
// computed by lib/progress/series.ts; (2) the patient-affect two-tap as a time series (the RCT
// tools only tally it — this orders it for a trend view). No I/O, no Date.now — everything derives
// from rows passed in.
import { dayInTz } from "@/lib/ai/rct-data";
import { type AcquisitionPoint, durationTicks, formatDuration } from "@/lib/progress/series";
import { TRENDS_COPY } from "./copy";

export interface IntervalBandPoint {
  sessionId: string;
  day: string;
  bandIndex: number; // 0-based index into this target's own ladder rungs
  bandLabel: string; // formatDuration of the rung reached
  totalBands: number;
}

/**
 * Buckets each acquisition point into the geometric rung (durationTicks) it has reached: the
 * highest rung at or below the session's best recall. Self-referenced by construction — the
 * ladder is derived from this target's own base/max interval, never a population norm.
 */
export function toIntervalBandSeries(
  points: AcquisitionPoint[],
  baseIntervalSec: number,
  maxIntervalSec: number,
): IntervalBandPoint[] {
  const ticks = durationTicks(baseIntervalSec, maxIntervalSec);
  const bandIndexFor = (sec: number) => {
    let idx = 0;
    for (let i = 0; i < ticks.length; i++) {
      if (sec >= ticks[i]) idx = i;
    }
    return idx;
  };
  return points.map((p) => {
    const bandIndex = bandIndexFor(p.bestRecallSec);
    return {
      sessionId: p.sessionId,
      day: p.day,
      bandIndex,
      bandLabel: formatDuration(ticks[bandIndex]),
      totalBands: ticks.length,
    };
  });
}

export interface CurrentBand {
  bandIndex: number;
  bandLabel: string;
  totalBands: number;
  atGoal: boolean;
}

/** The most recently reached rung for one target — the snapshot shown in the band chart. */
export function currentBand(
  points: AcquisitionPoint[],
  baseIntervalSec: number,
  maxIntervalSec: number,
): CurrentBand | null {
  const series = toIntervalBandSeries(points, baseIntervalSec, maxIntervalSec);
  const last = series.at(-1);
  if (!last) return null;
  return {
    bandIndex: last.bandIndex,
    bandLabel: last.bandLabel,
    totalBands: last.totalBands,
    atGoal: last.bandIndex === last.totalBands - 1,
  };
}

export interface AffectSessionRow {
  id: string;
  started_at: string;
  affect_pre: string | null;
  affect_post: string | null;
}

export interface AffectPoint {
  sessionId: string;
  day: string;
  pre: "content" | "unsettled" | null;
  post: "content" | "unsettled" | null;
}

const asAffect = (a: string | null): "content" | "unsettled" | null =>
  a === "content" || a === "unsettled" ? a : null;

/**
 * Session-ordered affect two-tap series. Sessions where neither tap was made (both skipped) are
 * dropped — there's nothing to plot; `describeAffect`'s counts and this series must agree on what
 * counts as a captured check-in.
 */
export function toAffectSeries(sessions: AffectSessionRow[], timeZone: string): AffectPoint[] {
  return [...sessions]
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((s) => ({
      sessionId: s.id,
      day: dayInTz(s.started_at, timeZone),
      pre: asAffect(s.affect_pre),
      post: asAffect(s.affect_post),
    }))
    .filter((p) => p.pre !== null || p.post !== null);
}

/** Plain-language, purely descriptive affect summary — counts only, no trend interpretation. */
export function describeAffect(points: AffectPoint[]): string | null {
  if (points.length === 0) return null;
  const count = (pick: (p: AffectPoint) => AffectPoint["pre"], value: "content" | "unsettled") =>
    points.filter((p) => pick(p) === value).length;

  return TRENDS_COPY.affect.summary(
    points.length,
    count((p) => p.pre, "content"),
    count((p) => p.pre, "unsettled"),
    count((p) => p.post, "content"),
    count((p) => p.post, "unsettled"),
  );
}

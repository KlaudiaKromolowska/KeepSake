// Pure transformation: trial logs → per-session acquisition series + describable text summary.
// No I/O, no Date.now — everything derives from the rows passed in (testable, deterministic).
import { PROGRESS_COPY } from "./copy";

/** Minimal row shapes the mapper needs — match the /progress page selects. */
export interface ProgressSessionRow {
  id: string;
  started_at: string;
}
export interface ProgressTrialRow {
  session_id: string;
  interval_sec: number;
  outcome: string;
  is_screening: boolean;
  at: string;
}

export interface AcquisitionPoint {
  /** Session id — the stable render key (two sessions can share a day). */
  sessionId: string;
  /** YYYY-MM-DD in the patient's timezone (calendar-day rules resolve there). */
  day: string;
  /** Longest delay (seconds) recalled in the session. */
  bestRecallSec: number;
  /** Session opened with a start-probe miss — shown as "began with a quick reminder". */
  startMiss: boolean;
}

/** ISO instant → YYYY-MM-DD in `timeZone`. Mirrors api/rct-report/route.ts dayInTz. */
function dayInTz(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * One point per session: the longest successfully recalled interval, ordered by session start.
 * Screening (candidacy) trials never count; a session with no successful recall yields no point.
 */
export function toAcquisitionSeries(
  sessions: ProgressSessionRow[],
  trials: ProgressTrialRow[],
  timeZone: string,
): AcquisitionPoint[] {
  const bySession = new Map<string, ProgressTrialRow[]>();
  for (const t of trials) {
    if (t.is_screening) continue;
    const list = bySession.get(t.session_id) ?? [];
    list.push(t);
    bySession.set(t.session_id, list);
  }

  const points: AcquisitionPoint[] = [];
  for (const s of [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const own = (bySession.get(s.id) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    const recalls = own.filter((t) => t.outcome === "recall");
    if (recalls.length === 0) continue;
    points.push({
      sessionId: s.id,
      day: dayInTz(s.started_at, timeZone),
      bestRecallSec: Math.max(...recalls.map((t) => t.interval_sec)),
      startMiss: own[0]?.outcome === "miss",
    });
  }
  return points;
}

/** Seconds → "34 sec" / "1 min" / "1 min 16 sec". */
export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} sec`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest === 0 ? `${m} min` : `${m} min ${rest} sec`;
}

/** "2026-07-03" → "Jul 3" (locale-stable en-US short form); unparsable input passes through. */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * Y-axis ticks for the geometric interval ladder: ×4 steps from the base interval, always ending
 * exactly at the ceiling (the "goal" line). Degenerate domains collapse to just the ceiling.
 */
export function durationTicks(baseSec: number, maxSec: number): number[] {
  if (baseSec <= 0 || baseSec >= maxSec) return [maxSec];
  const ticks: number[] = [];
  for (let t = baseSec; t < maxSec; t *= 4) ticks.push(t);
  ticks.push(maxSec);
  return ticks;
}

/**
 * Log-scale position in [0, 1] (0 = base, 1 = ceiling), clamped. Log, not linear: the ladder is
 * geometric (×growthFactor per rung), so equal visual steps = equal rung climbs.
 */
export function logY(sec: number, minSec: number, maxSec: number): number {
  if (maxSec <= minSec) return 1;
  const clamped = Math.min(Math.max(sec, minSec), maxSec);
  return (Math.log(clamped) - Math.log(minSec)) / (Math.log(maxSec) - Math.log(minSec));
}

/**
 * Plain-language trend summary — the chart's accessible description (aria-label + visible
 * paragraph). Wellness-safe by construction: dips are "rebuilding", start-probe misses are
 * "a quick reminder". Returns null when there is nothing to describe.
 */
export function describeAcquisition(
  points: AcquisitionPoint[],
  maxIntervalSec: number,
): string | null {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;

  const { summary } = PROGRESS_COPY;
  const best = Math.max(...points.map((p) => p.bestRecallSec));
  const sentences: string[] = [];

  if (points.length === 1) {
    sentences.push(summary.single(formatDay(first.day), formatDuration(first.bestRecallSec)));
  } else {
    const n = points.length;
    const [firstDay, lastDay] = [formatDay(first.day), formatDay(last.day)];
    const [from, to] = [formatDuration(first.bestRecallSec), formatDuration(last.bestRecallSec)];
    if (last.bestRecallSec > first.bestRecallSec) {
      sentences.push(summary.grew(n, firstDay, lastDay, from, to));
    } else if (last.bestRecallSec === first.bestRecallSec) {
      sentences.push(summary.held(n, firstDay, lastDay, to));
    } else {
      sentences.push(summary.moved(n, firstDay, lastDay, from, to));
    }
  }

  if (last.bestRecallSec < best) sentences.push(summary.rebuilding(formatDuration(best)));

  const reminders = points.filter((p) => p.startMiss).length;
  if (reminders > 0) sentences.push(summary.reminders(reminders));

  if (best >= maxIntervalSec) sentences.push(summary.goalReached(formatDuration(maxIntervalSec)));

  return sentences.join(" ");
}

import { PROGRESS_COPY } from "@/lib/progress/copy";
import {
  type AcquisitionPoint,
  durationTicks,
  formatDay,
  formatDuration,
  logY,
} from "@/lib/progress/series";

/**
 * Per-target acquisition chart: one dot per session, y = longest delay recalled (log scale — the
 * interval ladder is geometric, so equal visual steps mean equal rung climbs). Server-rendered
 * inline SVG, no chart dependency, no client JS. Non-color-reliant: a single hue plus shape
 * (open circle = session that began with a reminder), position, and direct labels — legible in
 * grayscale. Describable: `summary` is the aria-label, and a table twin carries every value.
 */

const W = 640;
const H = 320;
const PAD = { left: 78, right: 70, top: 30, bottom: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// Light-only MVP theme (globals.css): series = validated slot-1 blue, chrome in zinc inks.
const SERIES = "#2a78d6";
const GRID = "#e4e4e7"; // zinc-200 hairline
const MUTED = "#71717a"; // zinc-500 axis text
const INK = "#18181b"; // zinc-900 labels

const round = (n: number) => Math.round(n * 100) / 100;

export function AcquisitionChart({
  points,
  baseIntervalSec,
  maxIntervalSec,
  summary,
}: {
  points: AcquisitionPoint[];
  baseIntervalSec: number;
  maxIntervalSec: number;
  summary: string;
}) {
  const n = points.length;
  const x = (i: number) =>
    round(n === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i * PLOT_W) / (n - 1));
  const y = (sec: number) =>
    round(PAD.top + (1 - logY(sec, baseIntervalSec, maxIntervalSec)) * PLOT_H);

  const ticks = durationTicks(baseIntervalSec, maxIntervalSec);
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)} ${y(p.bestRecallSec)}`)
    .join(" ");
  const last = points[n - 1];
  const labelStep = Math.ceil(n / 7); // day labels: at most ~7, always including the last
  const hasReminder = points.some((p) => p.startMiss);

  return (
    <figure className="flex w-full flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${PROGRESS_COPY.chartHeading}. ${summary}`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke={GRID}
              strokeWidth={1}
            />
            <text x={PAD.left - 10} y={y(tick) + 4} textAnchor="end" fontSize={13} fill={MUTED}>
              {formatDuration(tick)}
            </text>
          </g>
        ))}
        {/* The ceiling gridline is the in-session goal — name it, in the free right margin so it
            never collides with the last point's direct label. */}
        <text x={W - 4} y={y(maxIntervalSec) + 4} textAnchor="end" fontSize={12} fill={MUTED}>
          {PROGRESS_COPY.goalLabel}
        </text>

        {n > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke={SERIES}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {points.map((p, i) => (
          <g key={p.sessionId}>
            {p.startMiss ? (
              // Open circle: began with a quick reminder — shape carries it, not color.
              <circle
                cx={x(i)}
                cy={y(p.bestRecallSec)}
                r={6}
                fill="#ffffff"
                stroke={SERIES}
                strokeWidth={2.5}
              />
            ) : (
              <circle
                cx={x(i)}
                cy={y(p.bestRecallSec)}
                r={5}
                fill={SERIES}
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
            {(i % labelStep === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 14} textAnchor="middle" fontSize={13} fill={MUTED}>
                {formatDay(p.day)}
              </text>
            )}
          </g>
        ))}

        {/* Direct label on the latest session — the value the caregiver cares about. */}
        {last && (
          <text
            x={x(n - 1)}
            y={y(last.bestRecallSec) - 14}
            textAnchor="middle"
            fontSize={14}
            fontWeight={600}
            fill={INK}
          >
            {formatDuration(last.bestRecallSec)}
          </text>
        )}
      </svg>

      <figcaption className="flex flex-col gap-3">
        {hasReminder && <p className="text-base text-zinc-600">{PROGRESS_COPY.reminderKey}</p>}

        <details>
          <summary className="cursor-pointer text-base font-medium text-zinc-700">
            {PROGRESS_COPY.table.toggle}
          </summary>
          <table className="mt-3 w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-600">
                <th className="py-2 pr-4 font-medium">{PROGRESS_COPY.table.session}</th>
                <th className="py-2 pr-4 font-medium">{PROGRESS_COPY.table.delay}</th>
                <th className="py-2 font-medium">{PROGRESS_COPY.table.note}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.sessionId} className="border-b border-zinc-100">
                  <td className="py-2 pr-4">{formatDay(p.day)}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatDuration(p.bestRecallSec)}</td>
                  <td className="py-2 text-zinc-600">
                    {p.startMiss ? PROGRESS_COPY.table.reminderNote : PROGRESS_COPY.table.noNote}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

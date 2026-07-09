import { TRENDS_COPY } from "@/lib/trends/copy";
import type { CurrentBand } from "@/lib/trends/series";

/**
 * Ladder-progress snapshot across every target: one horizontal bar per target, filled to
 * `bandIndex / totalBands` of its own ladder — self-referenced per target, never a cross-target or
 * cross-person score. Server-rendered inline SVG, same hand-rolled conventions as
 * AcquisitionChart (single accent hue, direct labels, describable, table twin).
 */

const W = 640;
const ROW_H = 40;
const ROW_GAP = 14;
const PAD = { left: 0, right: 96, top: 8 };
const TRACK_W = W - PAD.right;

const SERIES = "#2a78d6";
const TRACK = "#e4e4e7";
const INK = "#18181b";
const MUTED = "#71717a";

export interface BandRow {
  targetId: string;
  question: string;
  band: CurrentBand | null;
}

export function BandChart({ rows }: { rows: BandRow[] }) {
  const withData = rows.filter((r) => r.band !== null);
  if (withData.length === 0) {
    return <p className="text-lg text-zinc-700">{TRENDS_COPY.band.empty}</p>;
  }

  const H = PAD.top * 2 + rows.length * ROW_H + (rows.length - 1) * ROW_GAP;
  const summary = rows
    .map((r) =>
      r.band
        ? `${r.question}: reached ${r.band.bandLabel}${r.band.atGoal ? " (goal reached)" : ""}.`
        : `${r.question}: ${TRENDS_COPY.band.emptyTarget}`,
    )
    .join(" ");

  return (
    <figure className="flex w-full flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${TRENDS_COPY.band.heading}. ${summary}`}
      >
        {rows.map((r, i) => {
          const y = PAD.top + i * (ROW_H + ROW_GAP);
          const fraction = r.band ? (r.band.bandIndex + 1) / r.band.totalBands : 0;
          return (
            <g key={r.targetId}>
              <text x={0} y={y + 14} fontSize={13} fill={INK} fontWeight={600}>
                {r.question}
              </text>
              <rect x={0} y={y + 20} width={TRACK_W} height={10} rx={5} fill={TRACK} />
              {r.band && (
                <rect
                  x={0}
                  y={y + 20}
                  width={round(TRACK_W * fraction)}
                  height={10}
                  rx={5}
                  fill={SERIES}
                />
              )}
              <text
                x={TRACK_W + 10}
                y={y + 29}
                fontSize={13}
                fill={r.band ? INK : MUTED}
                fontWeight={r.band?.atGoal ? 600 : 400}
              >
                {r.band ? r.band.bandLabel : "—"}
              </text>
            </g>
          );
        })}
      </svg>

      <figcaption>
        <details>
          <summary className="cursor-pointer text-base font-medium text-zinc-700">
            {TRENDS_COPY.band.table.toggle}
          </summary>
          <table className="mt-3 w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-600">
                <th className="py-2 pr-4 font-medium">{TRENDS_COPY.band.table.target}</th>
                <th className="py-2 font-medium">{TRENDS_COPY.band.table.band}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.targetId} className="border-b border-zinc-100">
                  <td className="py-2 pr-4">{r.question}</td>
                  <td className="py-2 tabular-nums">
                    {r.band ? r.band.bandLabel : TRENDS_COPY.band.emptyTarget}
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

const round = (n: number) => Math.round(n * 100) / 100;

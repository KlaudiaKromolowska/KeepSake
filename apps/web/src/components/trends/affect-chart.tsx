import { formatDay } from "@/lib/progress/series";
import { TRENDS_COPY } from "@/lib/trends/copy";
import { type AffectPoint, describeAffect } from "@/lib/trends/series";

/**
 * Patient-affect two-tap over time: one column per captured check-in, filled marker = calm, open
 * marker = unsettled, no marker = that tap was skipped. Shape (filled vs. open), not color, carries
 * the state — same non-color-reliant convention as AcquisitionChart's start-probe-reminder circle.
 */

const W = 640;
const H = 200;
const PAD = { left: 78, right: 24, top: 28, bottom: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const ROW_PRE_Y = PAD.top + 20;
const ROW_POST_Y = PAD.top + 80;

const SERIES = "#2a78d6";
const MUTED = "#71717a";

const round = (n: number) => Math.round(n * 100) / 100;

export function AffectChart({ points }: { points: AffectPoint[] }) {
  if (points.length === 0) {
    return <p className="text-lg text-zinc-700">{TRENDS_COPY.affect.empty}</p>;
  }

  const n = points.length;
  const x = (i: number) =>
    round(n === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i * PLOT_W) / (n - 1));
  const labelStep = Math.ceil(n / 7);
  const summary = describeAffect(points) ?? "";

  return (
    <figure className="flex w-full flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${TRENDS_COPY.affect.heading}. ${summary}`}
      >
        <text x={PAD.left - 10} y={ROW_PRE_Y + 4} textAnchor="end" fontSize={13} fill={MUTED}>
          {TRENDS_COPY.affect.table.pre}
        </text>
        <text x={PAD.left - 10} y={ROW_POST_Y + 4} textAnchor="end" fontSize={13} fill={MUTED}>
          {TRENDS_COPY.affect.table.post}
        </text>

        {points.map((p, i) => (
          <g key={p.sessionId}>
            <Marker cx={x(i)} cy={ROW_PRE_Y} value={p.pre} />
            <Marker cx={x(i)} cy={ROW_POST_Y} value={p.post} />
            {(i % labelStep === 0 || i === n - 1) && (
              <text x={x(i)} y={H - 14} textAnchor="middle" fontSize={13} fill={MUTED}>
                {formatDay(p.day)}
              </text>
            )}
          </g>
        ))}
      </svg>

      <figcaption className="flex flex-col gap-3">
        <p className="text-base text-zinc-600">{TRENDS_COPY.affect.legend}</p>

        <details>
          <summary className="cursor-pointer text-base font-medium text-zinc-700">
            {TRENDS_COPY.affect.table.toggle}
          </summary>
          <table className="mt-3 w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b border-zinc-300 text-zinc-600">
                <th className="py-2 pr-4 font-medium">{TRENDS_COPY.affect.table.session}</th>
                <th className="py-2 pr-4 font-medium">{TRENDS_COPY.affect.table.pre}</th>
                <th className="py-2 font-medium">{TRENDS_COPY.affect.table.post}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.sessionId} className="border-b border-zinc-100">
                  <td className="py-2 pr-4">{formatDay(p.day)}</td>
                  <td className="py-2 pr-4">{cellLabel(p.pre)}</td>
                  <td className="py-2">{cellLabel(p.post)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}

function Marker({
  cx,
  cy,
  value,
}: {
  cx: number;
  cy: number;
  value: "content" | "unsettled" | null;
}) {
  if (value === null) return null;
  if (value === "unsettled") {
    return <circle cx={cx} cy={cy} r={6} fill="#ffffff" stroke={SERIES} strokeWidth={2.5} />;
  }
  return <circle cx={cx} cy={cy} r={5} fill={SERIES} stroke="#ffffff" strokeWidth={2} />;
}

function cellLabel(value: "content" | "unsettled" | null): string {
  if (value === "content") return TRENDS_COPY.affect.table.content;
  if (value === "unsettled") return TRENDS_COPY.affect.table.unsettled;
  return TRENDS_COPY.affect.table.skipped;
}

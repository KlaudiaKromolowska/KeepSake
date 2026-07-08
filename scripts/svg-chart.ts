// Minimal, dependency-free SVG bar-chart renderer for the in-silico simulation report
// (docs/simulation). Deliberately plain: a single accent color, light background (so it reads
// cleanly embedded in a markdown doc or a slide), labeled axes, no external fonts/assets.
export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartOptions {
  title: string;
  subtitle?: string;
  data: BarDatum[];
  /** Appended after each value label, e.g. "%" or " days". */
  unit?: string;
  /** Format applied to each bar's value before `unit` is appended. Defaults to a compact number. */
  formatValue?: (v: number) => string;
  color?: string;
  width?: number;
  height?: number;
}

const FONT = 'font-family="-apple-system, Segoe UI, Helvetica, Arial, sans-serif"';

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Renders a simple vertical bar chart as a self-contained SVG string. */
export function barChartSvg(opts: BarChartOptions): string {
  const width = opts.width ?? 720;
  const height = opts.height ?? 400;
  const color = opts.color ?? "#2563eb";
  const formatValue =
    opts.formatValue ?? ((v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)));
  const margin = { top: 64, right: 24, bottom: 72, left: 56 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...opts.data.map((d) => d.value));
  const barGap = 10;
  const barWidth =
    opts.data.length > 0 ? (plotWidth - barGap * (opts.data.length - 1)) / opts.data.length : 0;

  const gridLines = 4;
  const gridSvg = Array.from({ length: gridLines + 1 }, (_, i) => {
    const y = margin.top + (plotHeight * i) / gridLines;
    const value = maxValue * (1 - i / gridLines);
    return `<line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280" ${FONT}>${formatValue(value)}</text>`;
  }).join("\n");

  const bars = opts.data
    .map((d, i) => {
      const x = margin.left + i * (barWidth + barGap);
      const barHeight = maxValue > 0 ? (d.value / maxValue) * plotHeight : 0;
      const y = margin.top + plotHeight - barHeight;
      const labelY = height - margin.bottom + 20;
      const valueLabel = `${formatValue(d.value)}${opts.unit ?? ""}`;
      return `<g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 0)}" fill="${color}" rx="2"/>
        <text x="${x + barWidth / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#111827" ${FONT}>${escapeXml(valueLabel)}</text>
        <text x="${x + barWidth / 2}" y="${labelY}" text-anchor="middle" font-size="11" fill="#374151" ${FONT}>${escapeXml(d.label)}</text>
      </g>`;
    })
    .join("\n");

  const subtitle = opts.subtitle
    ? `<text x="${margin.left}" y="40" font-size="13" fill="#6b7280" ${FONT}>${escapeXml(opts.subtitle)}</text>`
    : "";

  const titleId = "chart-title";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="${titleId}">
    <title id="${titleId}">${escapeXml(opts.title)}${opts.subtitle ? ` — ${escapeXml(opts.subtitle)}` : ""}</title>
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>
    <text x="${margin.left}" y="24" font-size="16" font-weight="600" fill="#111827" ${FONT}>${escapeXml(opts.title)}</text>
    ${subtitle}
    ${gridSvg}
    <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="#9ca3af" stroke-width="1"/>
    ${bars}
  </svg>`;
}

import { fmtNum } from "@/lib/format";

// One-series bar chart in plain SVG, rendered on the server. Each bar has a hover tooltip
// (a native <title> on a full-height hit area), and a table view sits under it.
export function BarChart({ title, unit, data }: { title: string; unit: string; data: { label: string; value: number }[] }) {
  const W = 640, H = 200, padL = 34, padR = 8, padT = 18, padB = 26;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(4, slot - 2 - Math.min(10, slot * 0.25));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure className="chart" style={{ margin: 0 }}>
      <div className="section-title">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="faint">{fmtNum(total)} {total === 1 ? unit.replace(/s$/, "") : unit} in {data.length} days</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: bar chart, ${data.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={padL - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, barW / 2, h);
          const showLabel = d.value > 0 && (i === maxIdx || i === data.length - 1);
          return (
            <g key={d.label}>
              <rect className="hit" x={padL + i * slot} y={padT} width={slot} height={plotH}>
                <title>{`${d.label}: ${fmtNum(d.value)} ${unit}`}</title>
              </rect>
              {h > 0 ? <path className="bar" d={roundedTop(x, y(0), barW, h, r)} pointerEvents="none" /> : null}
              {showLabel ? <text className="value-label" x={x + barW / 2} y={y(d.value) - 5} textAnchor="middle">{d.value}</text> : null}
              {i % 2 === (data.length - 1) % 2 ? (
                <text className="axis-label" x={x + barW / 2} y={H - 8} textAnchor="middle">{d.label}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <details>
        <summary className="faint">Table view</summary>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>Day</th><th className="num">{unit}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{fmtNum(d.value)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
  for (const m of [1, 2, 5, 10]) if (raw <= m * mag) return Math.max(1, m * mag);
  return 10 * mag;
}

function roundedTop(x: number, base: number, w: number, h: number, r: number): string {
  const t = base - h;
  return `M${x},${base} V${t + r} Q${x},${t} ${x + r},${t} H${x + w - r} Q${x + w},${t} ${x + w},${t + r} V${base} Z`;
}

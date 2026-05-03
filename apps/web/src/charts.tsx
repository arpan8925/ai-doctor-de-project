import type { DifferentialItem, VitalSeries } from "./types";

const PALETTE = ["#0ea5e9", "#14b8a6", "#8b5cf6", "#f59e0b", "#94a3b8"];

export function DifferentialDonut({ items }: { items: DifferentialItem[] }) {
  const size = 160;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = items.reduce((s, x) => s + x.probability, 0) || 1;

  let offset = 0;
  const arcs = items.map((it, i) => {
    const frac = it.probability / total;
    const dash = frac * c;
    const node = (
      <circle
        key={it.name}
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={PALETTE[i % PALETTE.length]}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={-offset}
        strokeLinecap="butt"
        style={{ transition: "stroke-dasharray 350ms ease" }}
      />
    );
    offset += dash;
    return node;
  });

  const top = items[0];
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {arcs}
      </svg>
      <div className="donut-center">
        <div className="donut-pct">{Math.round((top?.probability ?? 0) * 100)}%</div>
        <div className="donut-label">{top?.name ?? "—"}</div>
      </div>
    </div>
  );
}

export function DifferentialLegend({ items }: { items: DifferentialItem[] }) {
  return (
    <ul className="legend">
      {items.map((it, i) => (
        <li key={it.name}>
          <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />
          <span className="legend-name">{it.name}</span>
          {it.icd10 && <span className="legend-code">{it.icd10}</span>}
          <span className="legend-pct">{Math.round(it.probability * 100)}%</span>
        </li>
      ))}
    </ul>
  );
}

export function ClarificationGauge({ score, action }: { score: number; action: string }) {
  const r = 56;
  const c = Math.PI * r; // half-circle circumference
  const dash = (score / 100) * c;
  const tone = score < 70 ? "ask" : score < 95 ? "request" : "commit";
  return (
    <div className={`gauge tone-${tone}`}>
      <svg width="148" height="84" viewBox="0 0 148 84">
        <path
          d="M14 74 A60 60 0 0 1 134 74"
          fill="none"
          stroke="#eef2f7"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M14 74 A60 60 0 0 1 134 74"
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 400ms ease" }}
        />
        <defs>
          <linearGradient id="gauge-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#f59e0b" />
            <stop offset="0.6" stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="gauge-readout">
        <div className="gauge-num">{score}</div>
        <div className="gauge-meta">
          <span className="gauge-of">/100</span>
          <span className={`pill pill-${tone}`}>
            {action === "ask" && "Asking"}
            {action === "request_labs" && "Labs"}
            {action === "commit" && "Diagnosis"}
            {!["ask", "request_labs", "commit"].includes(action) && action}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Sparkline({
  series,
  height = 36,
  width = 200,
}: {
  series: VitalSeries;
  height?: number;
  width?: number;
}) {
  const { values, normalRange, status } = series;
  const min = Math.min(...values, normalRange[0]);
  const max = Math.max(...values, normalRange[1]);
  const span = max - min || 1;
  const stepX = width / (values.length - 1 || 1);

  const pts = values
    .map((v, i) => `${i * stepX},${height - ((v - min) / span) * height}`)
    .join(" ");

  const strokeColor =
    status === "alert" ? "#ef4444" : status === "watch" ? "#f59e0b" : "#14b8a6";

  const areaPts = `0,${height} ${pts} ${width},${height}`;

  const last = values[values.length - 1];
  return (
    <div className="sparkline">
      <div className="sparkline-head">
        <span className="sparkline-label">{series.label}</span>
        <span className="sparkline-value" style={{ color: strokeColor }}>
          {typeof last === "number" ? last.toLocaleString() : last} {series.unit}
        </span>
      </div>
      <svg width={width} height={height} className="sparkline-svg">
        <polygon points={areaPts} fill={strokeColor} opacity={0.08} />
        <polyline points={pts} fill="none" stroke={strokeColor} strokeWidth="1.6" />
        {values.map((v, i) =>
          v < normalRange[0] || v > normalRange[1] ? (
            <circle
              key={i}
              cx={i * stepX}
              cy={height - ((v - min) / span) * height}
              r="2"
              fill={strokeColor}
            />
          ) : null,
        )}
      </svg>
      <div className="sparkline-foot">
        normal {series.normalRange[0]}–{series.normalRange[1]} {series.unit}
      </div>
    </div>
  );
}

export function MiniBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="minibar">
      <div className="minibar-head">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="minibar-track">
        <div className="minibar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

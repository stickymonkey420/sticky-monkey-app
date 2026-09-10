import { GAUGE_GEOMETRY, polar, type GaugeConfig } from "@/lib/screener/gauge";

const CARD_CLASS = "rounded-[14px] border border-white/[0.12] bg-white/[0.03] p-5 text-center";

// Semicircle valuation gauge -- ported 1:1 from the live script's
// buildGauge() (arc geometry, tick placement, needle rotation, and
// off-scale note) as an SVG React component.
export default function Gauge({ value, config }: { value: number; config: GaugeConfig }) {
  const { cx, cy, r, thickness, needleLen } = GAUGE_GEOMETRY;
  const { maxV, stops, ticks, label, decimals = 2, gradId } = config;
  const clamped = Math.max(0, Math.min(value, maxV));
  const start = polar(180, r);
  const end = polar(0, r);
  const rotation = (clamped / maxV - 0.5) * 180;
  const tickValues = ticks ?? [0, maxV * 0.25, maxV * 0.5, maxV * 0.75, maxV];
  const valueDisplay = value.toFixed(decimals);
  const offScale = value > maxV;

  return (
    <div className={CARD_CLASS}>
      <svg viewBox="0 0 300 210" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}>
        <defs>
          <linearGradient id={gradId} x1={cx - r} y1={cy} x2={cx + r} y2={cy} gradientUnits="userSpaceOnUse">
            {stops.map((s, i) => (
              <stop key={i} offset={`${s.offset}%`} stopColor={s.color} />
            ))}
          </linearGradient>
        </defs>
        <path
          d={`M ${start.x.toFixed(1)} ${start.y.toFixed(1)} A ${r} ${r} 0 0 1 ${end.x.toFixed(1)} ${end.y.toFixed(1)}`}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
        />
        {tickValues.map((v, i) => {
          const ang = 180 - (v / maxV) * 180;
          const p = polar(ang, r + 24);
          return (
            <text
              key={i}
              x={p.x.toFixed(1)}
              y={p.y.toFixed(1)}
              fontSize={12}
              fill="hsla(223.9,28.67%,71.96%,1)"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {v.toFixed(1)}
            </text>
          );
        })}
        <line
          x1={cx}
          y1={cy}
          x2={cx}
          y2={cy - needleLen}
          stroke="#8b95a7"
          strokeWidth={4}
          strokeLinecap="round"
          transform={`rotate(${rotation.toFixed(1)} ${cx} ${cy})`}
        />
        <circle cx={cx} cy={cy} r={7} fill="#8b95a7" />
        <text x={cx} y={cy + 34} fontSize={26} fontWeight={700} fill="currentColor" textAnchor="middle">
          {valueDisplay}
          {offScale && (
            <tspan fontSize={12} fill="hsla(223.9,28.67%,71.96%,1)">
              {" "}
              (off scale)
            </tspan>
          )}
        </text>
        <text x={cx} y={cy + 56} fontSize={13} fill="hsla(223.9,28.67%,71.96%,1)" textAnchor="middle">
          {label}
        </text>
      </svg>
    </div>
  );
}

export function GaugeUnavailable({ label }: { label: string }) {
  return <div className={CARD_CLASS + " opacity-60"}>{label} not available for this ticker.</div>;
}

// Peter Lynch valuation gauges (PEG ratio, Debt/Equity) -- geometry and
// color-stop math ported verbatim from the live script's buildGauge(),
// buildPegGauge(), and buildDebtEquityGauge(). See Gauge.tsx for the SVG
// that consumes this.
export type GaugeStop = { offset: number; color: string };

export const GAUGE_GEOMETRY = { cx: 150, cy: 150, r: 95, thickness: 24, needleLen: 68 };

export function polar(angleDeg: number, radius: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const { cx, cy } = GAUGE_GEOMETRY;
  return { x: cx + radius * Math.cos(rad), y: cy - radius * Math.sin(rad) };
}

export type GaugeConfig = {
  maxV: number;
  stops: GaugeStop[];
  ticks?: number[];
  label: string;
  decimals?: number;
  gradId: string;
};

// Peter Lynch PEG gauge: 0 (green, cheap relative to growth) to 2.0 (red,
// expensive), with 1.0 (fair value) pointing straight up. Four Lynch
// valuation zones, each 0.5 of PEG wide (25% of the 0-2.0 scale).
export const PEG_GAUGE_CONFIG: GaugeConfig = {
  maxV: 2,
  gradId: "pegGaugeGrad",
  label: "PEG Ratio",
  stops: [
    { offset: 0, color: "#2ecc71" },
    { offset: 25, color: "#2ecc71" },
    { offset: 50, color: "#f1c40f" },
    { offset: 75, color: "#e67e22" },
    { offset: 100, color: "#e74c3c" },
  ],
};

// Peter Lynch Debt-to-Equity gauge: under 0.5 (green) means little to no
// debt; fades to yellow by 1.0 (moderate leverage) and red by the 2.0
// display ceiling (heavier debt load). Unlike PEG, 0 (debt-free) is a
// valid, meaningful reading -- not treated as "unavailable".
export const DEBT_EQUITY_GAUGE_CONFIG: GaugeConfig = {
  maxV: 2,
  gradId: "deGaugeGrad",
  label: "Debt/Equity",
  stops: [
    { offset: 0, color: "#3ddc97" },
    { offset: 25, color: "#3ddc97" },
    { offset: 50, color: "#ffd93d" },
    { offset: 100, color: "#ff5c5c" },
  ],
};

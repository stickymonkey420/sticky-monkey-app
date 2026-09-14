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

// Return on Equity gauge: unlike PEG/Debt-Equity, higher is better here, so
// the color ramp runs the opposite direction -- red at 0% (or negative,
// clamped to the 0 position but still shown as its true, possibly
// negative, number per Gauge.tsx's valueDisplay) up to green at 20%+.
// Scale ceiling of 30% covers the S&P 500's typical ~15-18% average with
// room above it for standout businesses; ~15% average large-cap ROE is
// the widely cited benchmark this gauge is calibrated against.
export const ROE_GAUGE_CONFIG: GaugeConfig = {
  maxV: 30,
  gradId: "roeGaugeGrad",
  label: "Return on Equity",
  decimals: 1,
  ticks: [0, 10, 20, 30],
  stops: [
    { offset: 0, color: "#ff5c5c" },
    { offset: 33, color: "#ffd93d" },
    { offset: 66, color: "#3ddc97" },
    { offset: 100, color: "#3ddc97" },
  ],
};

// Current Ratio gauge: current assets / current liabilities. Below 1.0 (red)
// means short-term obligations may outrun short-term assets; 1.0-1.5
// (yellow) is a thin cushion; the widely-cited healthy band is roughly
// 1.5-3.0 (green); above 3.0 tapers back to yellow since a very high ratio
// can mean idle cash/inventory rather than efficient use of assets. Scale
// ceiling of 4.0 keeps most real-world readings on-scale.
export const CURRENT_RATIO_GAUGE_CONFIG: GaugeConfig = {
  maxV: 4,
  gradId: "currentRatioGaugeGrad",
  label: "Current Ratio",
  decimals: 2,
  ticks: [0, 1, 2, 3, 4],
  stops: [
    { offset: 0, color: "#ff5c5c" },
    { offset: 25, color: "#ffd93d" },
    { offset: 37.5, color: "#3ddc97" },
    { offset: 75, color: "#3ddc97" },
    { offset: 100, color: "#ffd93d" },
  ],
};

// Return on Assets gauge: like ROE but measured against total assets rather
// than just equity, so typical readings run much lower -- Finnhub's own
// AAPL sample metric shows ~30%+ ROA against ~150%+ ROE for the same
// company. Higher is better (monotonic, like ROE), so the same red->
// yellow->green left-to-right ramp applies. Scale ceiling of 20% comfortably
// covers all but the most asset-light standout businesses.
export const ROA_GAUGE_CONFIG: GaugeConfig = {
  maxV: 20,
  gradId: "roaGaugeGrad",
  label: "Return on Assets",
  decimals: 1,
  ticks: [0, 5, 10, 15, 20],
  stops: [
    { offset: 0, color: "#ff5c5c" },
    { offset: 33, color: "#ffd93d" },
    { offset: 66, color: "#3ddc97" },
    { offset: 100, color: "#3ddc97" },
  ],
};

// Net Profit Margin gauge: how much of every sales dollar becomes actual
// profit after all expenses, interest, and taxes. Higher is better
// (monotonic); under ~5% is thin, 10-20% is solid, 20%+ is excellent.
// Scale ceiling of 30% covers the vast majority of profitable businesses.
export const NET_PROFIT_MARGIN_GAUGE_CONFIG: GaugeConfig = {
  maxV: 30,
  gradId: "netMarginGaugeGrad",
  label: "Net Profit Margin",
  decimals: 1,
  ticks: [0, 10, 20, 30],
  stops: [
    { offset: 0, color: "#ff5c5c" },
    { offset: 33, color: "#ffd93d" },
    { offset: 66, color: "#3ddc97" },
    { offset: 100, color: "#3ddc97" },
  ],
};

// Price/Free Cash Flow gauge: a valuation gauge like PEG/Debt-Equity where
// lower is cheaper, so the color ramp runs green->yellow->red left-to-right.
// Under ~15x is cheap relative to real cash generation, 15-25x is fair,
// above ~25x is pricey. Scale ceiling of 40 covers most non-extreme
// readings; negative or zero P/FCF (negative free cash flow) is treated as
// unavailable by the UI rather than plotted, since the ratio is meaningless
// there -- same convention as the PEG gauge.
export const PRICE_FCF_GAUGE_CONFIG: GaugeConfig = {
  maxV: 40,
  gradId: "priceFcfGaugeGrad",
  label: "Price/Free Cash Flow",
  decimals: 1,
  ticks: [0, 10, 20, 30, 40],
  stops: [
    { offset: 0, color: "#3ddc97" },
    { offset: 37.5, color: "#3ddc97" },
    { offset: 62.5, color: "#ffd93d" },
    { offset: 87.5, color: "#ff5c5c" },
    { offset: 100, color: "#ff5c5c" },
  ],
};

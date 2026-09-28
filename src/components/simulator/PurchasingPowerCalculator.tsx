"use client";

import { useMemo, useState } from "react";

// Purchasing Power (real return) calculator -- bottom of the Simulator page.
// Real rate uses the exact formula (1 + nominal) / (1 + inflation) - 1 rather
// than the "nominal minus inflation" shortcut. Chart: nominal growth vs.
// inflation-adjusted value over 20 years, with the gap shaded as the
// purchasing power inflation eats. Pure client-side math, no data calls.

const YEARS = 20;
const SUMMARY_YEAR = 10;
const NOMINAL_COLOR = "#6FA8FF";
const REAL_COLOR = "#3ddc97";
const LOSS_COLOR = "#ff5c7a";

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function kLabel(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n}`;
}

// "Nice" axis step so gridlines land on round numbers.
function niceStep(max: number, ticks = 5): number {
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
};

function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-text-muted">{label}</span>
        <span className="font-semibold tabular-nums text-text-primary">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#f5d020]"
      />
    </label>
  );
}

export default function PurchasingPowerCalculator() {
  const [initial, setInitial] = useState(10000);
  const [nominalPct, setNominalPct] = useState(5);
  const [inflationPct, setInflationPct] = useState(3.4);

  const n = nominalPct / 100;
  const i = inflationPct / 100;
  const real = (1 + n) / (1 + i) - 1;

  const series = useMemo(
    () =>
      Array.from({ length: YEARS + 1 }, (_, y) => ({
        year: y,
        nominal: initial * Math.pow(1 + n, y),
        real: initial * Math.pow(1 + real, y),
      })),
    [initial, n, real],
  );

  const at10 = series[SUMMARY_YEAR];
  const lost = at10.nominal - at10.real;

  // Chart geometry (viewBox units; scales to container width).
  const W = 720;
  const H = 300;
  const pad = { l: 52, r: 12, t: 12, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const dataMax = Math.max(...series.map((p) => Math.max(p.nominal, p.real)), 1);
  const step = niceStep(dataMax);
  const yMax = Math.ceil(dataMax / step) * step;
  const x = (y: number) => pad.l + (y / YEARS) * plotW;
  const yPx = (v: number) => pad.t + plotH - (Math.max(0, v) / yMax) * plotH;

  const nominalPath = series.map((p, k) => `${k ? "L" : "M"}${x(p.year).toFixed(1)},${yPx(p.nominal).toFixed(1)}`).join(" ");
  const realPath = series.map((p, k) => `${k ? "L" : "M"}${x(p.year).toFixed(1)},${yPx(p.real).toFixed(1)}`).join(" ");
  const gapPath =
    nominalPath +
    " " +
    [...series]
      .reverse()
      .map((p) => `L${x(p.year).toFixed(1)},${yPx(p.real).toFixed(1)}`)
      .join(" ") +
    " Z";
  const gridVals = Array.from({ length: Math.round(yMax / step) + 1 }, (_, k) => k * step);

  const realColor = real >= 0 ? REAL_COLOR : LOSS_COLOR;

  return (
    <div className="mt-6 rounded-2xl border border-card-border bg-card-bg">
      <div className="px-6 pt-5">
        <h3 className="text-sm font-semibold text-text-primary">Purchasing Power Calculator</h3>
        <p className="text-xs text-text-muted">What your return is really worth after inflation.</p>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 px-6 py-4 md:grid-cols-4">
        <div>
          <div className="text-xs text-text-muted">True purchasing power return (real rate)</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold tabular-nums" style={{ color: realColor }}>
              {real >= 0 ? "+" : ""}
              {(real * 100).toFixed(2)}%
            </span>
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] text-text-muted">exact formula</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{SUMMARY_YEAR}-year nominal value</div>
          <div className="mt-1 text-xl font-bold tabular-nums text-text-primary">{usd(at10.nominal)}</div>
        </div>
        <div>
          <div className="text-xs text-text-muted">{SUMMARY_YEAR}-year real power</div>
          <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: realColor }}>
            {usd(at10.real)}
          </div>
        </div>
        <div>
          <div className="text-xs text-text-muted">Purchasing power lost</div>
          <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: lost > 0 ? LOSS_COLOR : REAL_COLOR }}>
            {usd(Math.abs(lost))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-y border-white/[0.08] px-6 py-2.5 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: NOMINAL_COLOR }} />
          Nominal growth ({nominalPct.toFixed(1)}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: realColor }} />
          Purchasing power ({(real * 100).toFixed(1)}% real)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm border" style={{ background: "rgba(255,92,122,0.15)", borderColor: "rgba(255,92,122,0.35)" }} />
          Inflation loss gap ({inflationPct.toFixed(1)}%)
        </span>
      </div>

      {/* Chart */}
      <div className="px-4 py-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Nominal growth versus purchasing power over 20 years">
          {gridVals.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={yPx(v)} y2={yPx(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray={v === 0 ? undefined : "4 4"} />
              <text x={pad.l - 8} y={yPx(v) + 4} textAnchor="end" fontSize="11" fill="rgba(148,158,189,0.85)">
                {kLabel(v)}
              </text>
            </g>
          ))}
          {series
            .filter((p) => p.year % 2 === 0)
            .map((p) => (
              <text key={p.year} x={x(p.year)} y={H - 8} textAnchor="middle" fontSize="11" fill="rgba(148,158,189,0.85)">
                Yr {p.year}
              </text>
            ))}
          <path d={gapPath} fill={lost >= 0 ? "rgba(255,92,122,0.15)" : "rgba(61,220,151,0.12)"} />
          <path d={realPath} fill="none" stroke={realColor} strokeWidth="2.5" strokeLinejoin="round" />
          <path d={nominalPath} fill="none" stroke={NOMINAL_COLOR} strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 gap-6 border-t border-white/[0.08] px-6 py-5 md:grid-cols-3">
        <Slider label="Initial Investment" value={initial} min={1000} max={100000} step={1000} display={usd(initial)} onChange={setInitial} />
        <Slider label="Nominal Interest Rate" value={nominalPct} min={0} max={15} step={0.1} display={`${nominalPct.toFixed(1)}%`} onChange={setNominalPct} />
        <Slider label="Inflation Rate" value={inflationPct} min={0} max={10} step={0.1} display={`${inflationPct.toFixed(1)}%`} onChange={setInflationPct} />
      </div>
    </div>
  );
}

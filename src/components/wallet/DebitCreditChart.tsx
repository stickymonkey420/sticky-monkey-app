"use client";

import { useState } from "react";
import { CATEGORICAL_PALETTE } from "@/lib/palette";
import { money } from "@/lib/options/queries";
import { computeFlowBuckets, type FlowGranularity } from "@/lib/wallet/calc";
import type { PlaidTransaction } from "@/lib/wallet/types";

type DebitCreditChartProps = {
  txs: PlaidTransaction[];
  loading: boolean;
};

const TABS: { key: FlowGranularity; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "ytd", label: "YTD" },
  { key: "alltime", label: "All-time" },
];

// Debit/credit is a 2-category identity encoding (which direction the
// money moved), not a magnitude ramp, so it draws the first two slots of
// the shared fixed categorical order rather than the live script's
// near-identical blues (#0147d3 debit / #018dd3 credit -- both blue,
// well under the dataviz skill's normal-vision floor).
const DEBIT_COLOR = CATEGORICAL_PALETTE[0];
const CREDIT_COLOR = CATEGORICAL_PALETTE[1];

const CHART_W = 560;
const CHART_H = 300;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;
const PAD_LEFT = 52;
const PAD_RIGHT = 12;

// Grouped bar chart with gridlines, a legend (mandatory for the 2 series
// per the dataviz skill), and a per-group hover tooltip -- replaces the
// live script's raw innerHTML SVG string-builder with the same visual
// layout, ported to React state instead of DOM queries.
export default function DebitCreditChart({ txs, loading }: DebitCreditChartProps) {
  const [tab, setTab] = useState<FlowGranularity>("monthly");
  const [hover, setHover] = useState<number | null>(null);

  const buckets = computeFlowBuckets(txs, tab);
  const innerW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const innerH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const maxRaw = buckets.reduce((m, b) => Math.max(m, b.debit, b.credit), 0);
  const max = (maxRaw <= 0 ? 1 : maxRaw) * 1.15;
  const n = buckets.length;
  const slot = n > 0 ? innerW / n : innerW;
  const barW = Math.min(16, slot * 0.28);
  const gap = 6;

  const gridLines = [0, 1, 2, 3, 4].map((g) => {
    const y = PAD_TOP + (innerH / 4) * g;
    const val = max - (max / 4) * g;
    return { y, val };
  });

  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Debit &amp; Credit Activity</h3>
        <div className="flex gap-1 rounded-xl border border-card-border bg-white/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setHover(null);
              }}
              className={
                "rounded-lg px-3 py-1 text-xs font-medium " +
                (tab === t.key
                  ? "bg-white/10 text-text-primary"
                  : "text-text-muted hover:text-text-primary")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend -- always shown for >=2 series, per the dataviz skill. */}
      <div className="mb-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEBIT_COLOR }} />
          Debit (money out)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CREDIT_COLOR }} />
          Credit (money in)
        </span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-text-muted">Loading…</div>
      ) : buckets.length === 0 ? (
        <div className="py-16 text-center text-sm text-text-muted">
          No transaction history yet. Connect a bank via Plaid to see your debit &amp; credit activity.
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block w-full" style={{ height: "auto" }}>
            {gridLines.map((g, i) => (
              <g key={i}>
                <line
                  x1={PAD_LEFT}
                  y1={g.y}
                  x2={CHART_W - PAD_RIGHT}
                  y2={g.y}
                  stroke="hsla(224.6,17.97%,42.55%,0.18)"
                  strokeWidth={1}
                />
                <text
                  x={PAD_LEFT - 8}
                  y={g.y + 4}
                  fontSize={11}
                  fill="hsla(223.9,28.67%,71.96%,1)"
                  textAnchor="end"
                >
                  {fmtCompact(g.val)}
                </text>
              </g>
            ))}
            {buckets.map((b, i) => {
              const cx = PAD_LEFT + slot * i + slot / 2;
              const dH = (b.debit / max) * innerH;
              const cH = (b.credit / max) * innerH;
              const dX = cx - gap / 2 - barW;
              const cX = cx + gap / 2;
              const isHover = hover === i;
              return (
                <g key={i}>
                  {/* Wide invisible hit target, bigger than the bars, per the interaction spec. */}
                  <rect
                    x={cx - slot / 2}
                    y={PAD_TOP}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                  />
                  <rect
                    x={dX}
                    y={CHART_H - PAD_BOTTOM - dH}
                    width={barW}
                    height={dH}
                    rx={4}
                    fill={DEBIT_COLOR}
                    opacity={isHover || hover === null ? 1 : 0.45}
                  />
                  <rect
                    x={cX}
                    y={CHART_H - PAD_BOTTOM - cH}
                    width={barW}
                    height={cH}
                    rx={4}
                    fill={CREDIT_COLOR}
                    opacity={isHover || hover === null ? 1 : 0.45}
                  />
                  <text
                    x={cx}
                    y={CHART_H - PAD_BOTTOM + 20}
                    fontSize={12}
                    fill={isHover ? "hsla(240,15.15%,93.53%,1)" : "hsla(223.9,28.67%,71.96%,1)"}
                    textAnchor="middle"
                  >
                    {b.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {hovered && hover !== null && (
            <div
              className="pointer-events-none absolute rounded-lg border border-card-border bg-card-bg px-3 py-2 text-xs shadow-lg"
              style={{
                left: `${((PAD_LEFT + slot * hover + slot / 2) / CHART_W) * 100}%`,
                top: 4,
                transform: "translateX(-50%)",
              }}
            >
              <div className="mb-1 font-medium text-text-primary">{hovered.label}</div>
              <div style={{ color: DEBIT_COLOR }}>Debit: {money(hovered.debit)}</div>
              <div style={{ color: CREDIT_COLOR }}>Credit: {money(hovered.credit)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtCompact(n: number): string {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k` : `${sign}$${Math.round(abs)}`;
}

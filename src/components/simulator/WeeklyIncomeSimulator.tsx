"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  CategoryScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { createClient } from "@/lib/supabase/client";
import { computeSuggestedRate, computeSummary, money, pct, DEFAULT_INPUTS } from "@/lib/simulator/calc";
import { fetchCspTrades } from "@/lib/simulator/queries";
import type { SimulatorInputs } from "@/lib/simulator/types";

Chart.register(LineController, LineElement, LinearScale, CategoryScale, PointElement, Tooltip, Filler);

const LINE_COLOR = "#4f8cff";

type FieldProps = {
  id: string;
  label: string;
  value: number;
  step?: string;
  onChange: (v: number) => void;
};

// Keeps the raw typed text locally so a field can be fully cleared: an empty
// box shows a faded "0" placeholder (and still counts as 0 in the math)
// instead of a hard 0 that Backspace can't remove. If the value changes from
// outside (e.g. "Use my CSP trade history"), the display follows it.
function Field({ id, label, value, step, onChange }: FieldProps) {
  const [text, setText] = useState(Number.isFinite(value) && value !== 0 ? String(value) : "");
  const textAsNumber = text === "" ? 0 : Number(text);
  const display =
    textAsNumber === value || (text !== "" && Number.isNaN(textAsNumber))
      ? text
      : Number.isFinite(value) && value !== 0
        ? String(value)
        : "";

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        placeholder="0"
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const n = raw === "" ? 0 : Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="w-full rounded-[10px] border border-white/10 bg-[#0d0f17] px-2.5 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted/40 focus:border-[#4f8cff]"
      />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[14px] border border-card-border bg-[#0d0f17] p-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="text-xl font-bold text-text-primary">{value}</div>
      <div className="mt-1 text-[11px] text-text-muted">{sub}</div>
    </div>
  );
}

// Port of the live "Weekly Income Simulator (Wheel Strategy)" footer widget
// (Simulator page, page id 6a8cd798d6044b9cc6fbe79f). Fully self-contained:
// six inputs, four result tiles, a 52-week capital-growth chart, and a
// long-term (1-30yr) compounding table -- all client-side math (see
// lib/simulator/calc.ts). The only read is CSP trade history, used purely
// to suggest a starting weekly rate; there are no writes at all.
export default function WeeklyIncomeSimulator() {
  const [inputs, setInputs] = useState<SimulatorInputs>(DEFAULT_INPUTS);
  const [suggestedRate, setSuggestedRate] = useState<number | null>(null);
  const [rateTouched, setRateTouched] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const rows = await fetchCspTrades(supabase, user.id);
      if (cancelled) return;
      const rate = computeSuggestedRate(rows);
      if (rate !== null) {
        setSuggestedRate(rate);
        // Auto-fill only if the user hasn't touched the rate field yet,
        // matching the live script (only fills when rateInput.value === 0).
        setInputs((prev) => (!rateTouched && prev.ratePct === 0 ? { ...prev, ratePct: Number((rate * 100).toFixed(3)) } : prev));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => computeSummary(inputs), [inputs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: summary.series52.map((_, i) => `Wk ${i}`),
        datasets: [
          {
            data: summary.series52,
            borderColor: LINE_COLOR,
            backgroundColor: "rgba(79,140,255,0.12)",
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.15,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 20, 34, 0.95)",
            titleColor: "#e6ebf5",
            bodyColor: "#c7d0e3",
            borderColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (item) => money(Number(item.raw), 0),
            },
          },
        },
        scales: {
          x: { display: false },
          y: {
            grid: { color: "rgba(255,255,255,0.08)" },
            ticks: { color: "rgba(148,158,189,0.85)", font: { size: 11 } },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [summary.series52]);

  function setField<K extends keyof SimulatorInputs>(key: K, value: number) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-6">
      <h2 className="mb-1 text-lg font-bold text-text-primary">Weekly Income Simulator (Wheel Strategy)</h2>
      <p className="mb-5 max-w-2xl text-[12.5px] leading-relaxed text-text-muted">
        Project weekly options-wheel income forward, compounding capital week over week. Adjust any input; everything
        recalculates live.
      </p>

      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="wis-capital" label="Trading Capital ($)" value={inputs.capital} step="100" onChange={(v) => setField("capital", v)} />
        <div>
          <Field
            id="wis-rate"
            label="Weekly Return (%)"
            value={inputs.ratePct}
            step="0.01"
            onChange={(v) => {
              setRateTouched(true);
              setField("ratePct", v);
            }}
          />
          {suggestedRate !== null && (
            <button
              type="button"
              onClick={() => {
                setRateTouched(true);
                setField("ratePct", Number((suggestedRate * 100).toFixed(3)));
              }}
              className="mt-1.5 text-left text-[11px] text-[#4f8cff] hover:underline"
            >
              Use my CSP trade history → {pct(suggestedRate)}
            </button>
          )}
        </div>
        <Field id="wis-margin" label="Margin Loan ($)" value={inputs.margin} step="100" onChange={(v) => setField("margin", v)} />
        <Field
          id="wis-margin-rate"
          label="Margin Rate (% APR)"
          value={inputs.marginRatePct}
          step="0.1"
          onChange={(v) => setField("marginRatePct", v)}
        />
        <Field id="wis-expenses" label="Monthly Expenses ($)" value={inputs.expenses} step="10" onChange={(v) => setField("expenses", v)} />
        <Field id="wis-years" label="Years to Project" value={inputs.years} step="1" onChange={(v) => setField("years", v)} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Weekly Net Income" value={money(summary.weeklyNet)} sub="at week 1 pace" />
        <Tile label="Monthly Net Income" value={money(summary.monthlyNet)} sub="52/12 weeks" />
        <Tile label="Annual Net Income" value={money(summary.annualNet)} sub="not compounded" />
        <Tile
          label="Capital After 1 Year"
          value={money(summary.yearEndCapital)}
          sub={`+${money(summary.yearEndCumulativeNet)} net income, reinvested`}
        />
      </div>

      <div className="mb-5 rounded-[14px] border border-card-border bg-[#0d0f17] p-4">
        <div className="mb-2.5 text-[12.5px] font-semibold text-text-primary">
          Capital growth — next 52 weeks (reinvesting all net income)
        </div>
        <div className="h-[160px]">
          <canvas ref={canvasRef} />
        </div>
      </div>

      <div>
        <div className="mb-2.5 text-[12.5px] font-semibold text-text-primary">Long-term projection (fully reinvested)</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="border-b border-card-border pb-2 pr-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                  Year
                </th>
                <th className="border-b border-card-border pb-2 pr-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                  Ending Capital
                </th>
                <th className="border-b border-card-border pb-2 pr-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">
                  Cumulative Net Income
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.yearlyRows.map((r) => (
                <tr key={r.year}>
                  <td className="border-b border-white/5 py-2 pr-2.5 text-sm text-text-primary">Year {r.year}</td>
                  <td className="border-b border-white/5 py-2 pr-2.5 text-sm text-text-primary">{money(r.capital)}</td>
                  <td className="border-b border-white/5 py-2 pr-2.5 text-sm text-text-muted">{money(r.cumulativeNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

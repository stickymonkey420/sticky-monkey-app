"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";
import { createClient } from "@/lib/supabase/client";
import {
  GRANULARITIES,
  buildBuckets,
  fetchIncomeBusiness,
  fetchIncomeMarketGains,
  fetchIncomePremium,
  fetchMonthlyGoal,
  fetchNetWorthSnapshots,
  isoDate,
  money,
  saveMonthlyGoal,
  type Granularity,
  type HistoryBucket,
} from "@/lib/dashboard/historyCharts";

Chart.register(BarController, LineController, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const GRID_COLOR = "rgba(255, 255, 255, 0.08)";
const TICK_COLOR = "rgba(148, 158, 189, 0.85)";
const LINE_COLOR = "#6FA8FF";
const BEAT_COLOR = "#3ddc97";
const MISS_COLOR = "#ff6b6b";

export default function NetWorthHistoryChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  const [goalMonthly, setGoalMonthly] = useState(0);
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  // Whether the currently-selected range has any income OR net worth
  // snapshot data -- per your call to hide zero/not-applicable Dashboard
  // cards. Same "start false, hidden wrapper not conditional unmount"
  // approach as IncomeHistoryChart, so the canvas ref stays stable for
  // Chart.js.
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function loadAndRender() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !canvasRef.current) return;

      const buckets = buildBuckets(granularity);
      const rangeStart = isoDate(buckets[0].start);

      const [goal] = await Promise.all([
        fetchMonthlyGoal(supabase, user.id),
        fetchIncomePremium(supabase, user.id, buckets, rangeStart),
        fetchIncomeBusiness(supabase, user.id, buckets),
        fetchIncomeMarketGains(supabase, user.id, buckets),
        fetchNetWorthSnapshots(supabase, user.id, buckets, rangeStart),
      ]);
      if (cancelled) return;
      setGoalMonthly(goal);
      setHasData(buckets.some((b) => b.income !== 0 || (b.netWorth !== null && b.netWorth !== 0)));
      renderChart(buckets, goal);
    }

    function renderChart(buckets: HistoryBucket[], goal: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const bucketGoal = buckets.length ? goal * buckets[0].months : 0;
      const lastIdx = buckets.length - 1;
      const beatGoal = bucketGoal > 0 && buckets[lastIdx] && buckets[lastIdx].income >= bucketGoal;

      const h = canvas.clientHeight || 220;
      const barGradient = ctx.createLinearGradient(0, 0, 0, h);
      barGradient.addColorStop(0, "rgba(76, 126, 255, 0.85)");
      barGradient.addColorStop(1, "rgba(76, 126, 255, 0.05)");

      const pointColors: string[] = buckets.map(() => LINE_COLOR);
      const pointRadii: number[] = buckets.map(() => 5);
      if (bucketGoal > 0 && lastIdx >= 0) {
        pointColors[lastIdx] = beatGoal ? BEAT_COLOR : MISS_COLOR;
        pointRadii[lastIdx] = 7;
      }

      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }

      chartRef.current = new Chart(ctx, {
        data: {
          labels: buckets.map((b) => b.label),
          datasets: [
            {
              type: "bar",
              label: "Income",
              data: buckets.map((b) => b.income),
              backgroundColor: barGradient,
              borderRadius: 4,
              maxBarThickness: 26,
              yAxisID: "yIncome",
              order: 2,
            },
            {
              type: "line",
              label: "Net Worth",
              data: buckets.map((b) => b.netWorth),
              spanGaps: false,
              borderColor: LINE_COLOR,
              backgroundColor: LINE_COLOR,
              borderWidth: 2.5,
              pointRadius: pointRadii,
              pointHoverRadius: pointRadii.map((r) => r + 1),
              pointBackgroundColor: pointColors,
              pointBorderColor: "rgba(255,255,255,0.9)",
              pointBorderWidth: 1.5,
              tension: 0.35,
              yAxisID: "yNetWorth",
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: "index", intersect: false },
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
                label: (item) => {
                  if (item.raw === null || item.raw === undefined) return "";
                  if (item.dataset.label === "Net Worth") {
                    let line = "Net Worth: " + money(Number(item.raw));
                    if (bucketGoal > 0 && item.dataIndex === lastIdx) {
                      const diff = buckets[lastIdx].income - bucketGoal;
                      line += diff >= 0 ? `  (beat goal by ${money(diff)})` : `  (short of goal by ${money(-diff)})`;
                    }
                    return line;
                  }
                  return "Income: " + money(Number(item.raw));
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: TICK_COLOR, font: { size: 12 } },
            },
            yIncome: {
              type: "linear",
              position: "left",
              beginAtZero: true,
              grid: { color: GRID_COLOR },
              ticks: { color: TICK_COLOR, font: { size: 12 }, callback: (v) => Number(v) / 1000 + "k" },
            },
            yNetWorth: {
              type: "linear",
              position: "right",
              beginAtZero: false,
              display: false,
              grid: { drawOnChartArea: false },
            },
          },
        },
        plugins: [
          {
            id: "smfLineGlow",
            beforeDatasetDraw(chart, args) {
              if (args.index === 1) {
                chart.ctx.save();
                chart.ctx.shadowColor = "rgba(111, 168, 255, 0.85)";
                chart.ctx.shadowBlur = 10;
              }
            },
            afterDatasetDraw(chart, args) {
              if (args.index === 1) chart.ctx.restore();
            },
          },
          {
            id: "smfGoalLine",
            afterDraw(chart) {
              if (bucketGoal <= 0) return;
              const scale = chart.scales.yIncome;
              if (!scale) return;
              const y = scale.getPixelForValue(bucketGoal);
              const area = chart.chartArea;
              const c = chart.ctx;
              c.save();
              c.strokeStyle = "rgba(148, 158, 189, 0.55)";
              c.lineWidth = 1.5;
              c.setLineDash([5, 4]);
              c.beginPath();
              c.moveTo(area.left, y);
              c.lineTo(area.right, y);
              c.stroke();
              c.restore();
            },
          },
        ],
      });
    }

    loadAndRender();
    return () => {
      cancelled = true;
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [granularity]);

  async function handleSaveGoal() {
    const v = Math.max(0, Number(goalInput) || 0);
    setSavingGoal(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSavingGoal(false);
      return;
    }
    const ok = await saveMonthlyGoal(supabase, user.id, v);
    setSavingGoal(false);
    if (ok) {
      setGoalMonthly(v);
      setEditingGoal(false);
      setGranularity((g) => g);
    } else {
      window.alert("Could not save your goal. Please try again.");
    }
  }

  return (
    <div hidden={!hasData} className="rounded-2xl border border-card-border bg-card-bg p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Net Worth History</h3>
        <select
          value={granularity}
          onChange={(e) => setGranularity(e.target.value as Granularity)}
          className="rounded-md border border-card-border bg-white/5 px-2 py-1 text-xs text-text-primary"
        >
          {GRANULARITIES.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2.5 text-xs text-text-muted">
        <span>
          {goalMonthly > 0 ? `Monthly Income Goal: ${money(goalMonthly)}` : "No income goal set yet."}
        </span>
        {!editingGoal ? (
          <button
            type="button"
            onClick={() => {
              setGoalInput(goalMonthly > 0 ? String(goalMonthly) : "");
              setEditingGoal(true);
            }}
            className="underline"
            style={{ color: "#6FA8FF" }}
          >
            Set Goal
          </button>
        ) : (
          <>
            <input
              type="number"
              min={0}
              step={50}
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="Monthly goal $"
              className="w-32 rounded-md border border-white/15 bg-[#0d0f17] px-2 py-1 text-xs text-[#e7e9f5]"
            />
            <button
              type="button"
              onClick={handleSaveGoal}
              disabled={savingGoal}
              className="rounded-md px-2.5 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: "#4f8cff" }}
            >
              {savingGoal ? "Saving…" : "Save"}
            </button>
          </>
        )}
      </div>

      <div className="h-[220px]">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

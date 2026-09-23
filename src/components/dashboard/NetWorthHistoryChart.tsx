"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
import { getSharedGoal, getSharedGoalServerSnapshot, setSharedGoal, subscribeSharedGoal } from "@/lib/dashboard/goalStore";

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
  // Read through the shared goal store (see goalStore.ts) instead of local
  // state, so saving the goal on IncomeHistoryChart updates this chart
  // immediately too, and vice versa -- previously each chart held its own
  // independent goalMonthly state with no way to learn the other had
  // changed it short of a reload.
  const sharedGoal = useSyncExternalStore(subscribeSharedGoal, getSharedGoal, getSharedGoalServerSnapshot);
  const goalMonthly = sharedGoal ?? 0;
  const [goalInput, setGoalInput] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  // Whether the currently-selected range has any income OR net worth
  // snapshot data -- per your call to hide zero/not-applicable Dashboard
  // cards. Same "start false, hidden wrapper not conditional unmount"
  // approach as IncomeHistoryChart, so the canvas ref stays stable for
  // Chart.js.
  const [hasData, setHasData] = useState(false);
  // Buckets are kept in state (rather than only living inside the fetch
  // effect's closure) so the chart can be redrawn on a goal change alone,
  // without re-fetching. Same fix as IncomeHistoryChart.tsx: handleSaveGoal
  // used to call setGranularity((g) => g) to "nudge" a redraw, but since the
  // value doesn't actually change, the effect below (keyed on [granularity])
  // never re-ran -- the "Monthly Income Goal: $X" text updated instantly
  // (separate state) while the chart itself, including the tooltip's
  // beat/short-of-goal math and the dashed goal line, kept using the OLD
  // goal from before the edit until the next full page load.
  const [buckets, setBuckets] = useState<HistoryBucket[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const newBuckets = buildBuckets(granularity);
      const rangeStart = isoDate(newBuckets[0].start);

      const [goal] = await Promise.all([
        fetchMonthlyGoal(supabase, user.id),
        fetchIncomePremium(supabase, user.id, newBuckets, rangeStart),
        fetchIncomeBusiness(supabase, user.id, newBuckets),
        fetchIncomeMarketGains(supabase, user.id, newBuckets),
        fetchNetWorthSnapshots(supabase, user.id, newBuckets, rangeStart),
      ]);
      if (cancelled) return;
      setSharedGoal(goal);
      setHasData(
        newBuckets.some(
          (b) => b.income !== 0 || b.unrealizedGains !== 0 || (b.netWorth !== null && b.netWorth !== 0)
        )
      );
      setBuckets(newBuckets);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [granularity]);

  useEffect(() => {
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
                    // No beat/short-of-goal clause here: `bucketGoal` is the
                    // Monthly Income Goal, not a net worth target, so
                    // diffing it against Net Worth ("beat goal by $500" next
                    // to a $200,000 figure) read as nonsensical. That
                    // comparison belongs on the Income bar below instead.
                    return "Net Worth: " + money(Number(item.raw));
                  }
                  // `item.raw` here is realized income only -- unrealized
                  // (mark-to-market) position gains are excluded from the
                  // bar/goal comparison (see fetchIncomeMarketGains) since
                  // a paper gain can reverse before it's ever realized, and
                  // are noted separately below instead.
                  const b = buckets[item.dataIndex];
                  const unrealized = b ? b.unrealizedGains : 0;
                  const unrealizedNote =
                    unrealized !== 0 ? `  |  +${money(unrealized)} unrealized (not counted toward goal)` : "";
                  if (bucketGoal > 0 && item.dataIndex === lastIdx) {
                    const diff = buckets[lastIdx].income - bucketGoal;
                    return (
                      "Income (realized): " +
                      money(Number(item.raw)) +
                      (diff >= 0 ? `  (beat goal by ${money(diff)})` : `  (short of goal by ${money(-diff)})`) +
                      unrealizedNote
                    );
                  }
                  return "Income (realized): " + money(Number(item.raw)) + unrealizedNote;
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

    renderChart(buckets, goalMonthly);
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [buckets, goalMonthly]);

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
      setSharedGoal(v);
      setEditingGoal(false);
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

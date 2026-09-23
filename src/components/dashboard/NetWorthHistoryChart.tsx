"use client";

import { useEffect, useRef, useState } from "react";
import {
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
  fetchNetWorthSnapshots,
  isoDate,
  money,
  type Granularity,
  type HistoryBucket,
} from "@/lib/dashboard/historyCharts";

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const GRID_COLOR = "rgba(255, 255, 255, 0.08)";
const TICK_COLOR = "rgba(148, 158, 189, 0.85)";
const LINE_COLOR = "#6FA8FF";

// Per your call (2026-09-23): this card used to plot the Income bars
// alongside the Net Worth line and share the Monthly Income Goal label with
// IncomeHistoryChart -- with the Net Worth line drawn against its own
// hidden axis, the Income bars visually dominated and this read as "another
// Income chart" rather than a Net Worth one. Income already has its own
// dedicated chart elsewhere on the Dashboard, so this card is now Net Worth
// only: no Income series, no goal line, no goal label.
export default function NetWorthHistoryChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [granularity, setGranularity] = useState<Granularity>("weekly");
  // Whether the currently-selected range has any net worth snapshot data --
  // per your call to hide zero/not-applicable Dashboard cards. Starts false
  // so the card stays hidden until the first fetch actually confirms real
  // data, rather than flashing an empty chart first.
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
      await fetchNetWorthSnapshots(supabase, user.id, buckets, rangeStart);
      if (cancelled) return;

      setHasData(buckets.some((b) => b.netWorth !== null && b.netWorth !== 0));
      renderChart(buckets);
    }

    function renderChart(buckets: HistoryBucket[]) {
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
          labels: buckets.map((b) => b.label),
          datasets: [
            {
              label: "Net Worth",
              data: buckets.map((b) => b.netWorth),
              spanGaps: false,
              borderColor: LINE_COLOR,
              backgroundColor: LINE_COLOR,
              borderWidth: 2.5,
              pointRadius: 5,
              pointHoverRadius: 6,
              pointBackgroundColor: LINE_COLOR,
              pointBorderColor: "rgba(255,255,255,0.9)",
              pointBorderWidth: 1.5,
              tension: 0.35,
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
                  return "Net Worth: " + money(Number(item.raw));
                },
              },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: TICK_COLOR, font: { size: 12 } },
            },
            y: {
              type: "linear",
              beginAtZero: false,
              grid: { color: GRID_COLOR },
              ticks: { color: TICK_COLOR, font: { size: 12 }, callback: (v) => Number(v) / 1000 + "k" },
            },
          },
        },
        plugins: [
          {
            id: "smfLineGlow",
            beforeDatasetDraw(chart, args) {
              if (args.index === 0) {
                chart.ctx.save();
                chart.ctx.shadowColor = "rgba(111, 168, 255, 0.85)";
                chart.ctx.shadowBlur = 10;
              }
            },
            afterDatasetDraw(chart, args) {
              if (args.index === 0) chart.ctx.restore();
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

      <div className="h-[220px]">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}

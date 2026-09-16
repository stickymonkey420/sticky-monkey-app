"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  CategoryScale,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";
import type { LeagueSnapshotRow } from "@/lib/gameAfi/leagueTypes";
import { formatPct } from "@/lib/gameAfi/leagueCalc";

Chart.register(LineController, LineElement, LinearScale, CategoryScale, PointElement, Tooltip, Legend, Filler);

// Sticky Monkey brand-ish rotating palette for however many managers a
// league has -- same yellow/green/orange/red core plus a few extras so an
// 8-manager league doesn't repeat colors.
const LINE_COLORS = ["#4f8cff", "#3ddc97", "#f5d020", "#ff5c7a", "#ff9d4d", "#a78bfa", "#22d3ee", "#f472b6"];

// One line per manager, average return over time -- the reference site's
// "Season Race". Snapshots come from the hourly
// game_afi_league_snapshot_now() cron job (see migration
// add_game_afi_league), so this fills in as the season progresses; a
// freshly-drafted league just shows a flat single point per manager.
export default function LeagueSeasonChart({ snapshots }: { snapshots: LeagueSnapshotRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const byUser = new Map<string, { label: string; points: LeagueSnapshotRow[] }>();
    for (const s of snapshots) {
      if (!byUser.has(s.userId)) byUser.set(s.userId, { label: s.username ?? "Manager", points: [] });
      byUser.get(s.userId)!.points.push(s);
    }
    const allTimes = Array.from(new Set(snapshots.map((s) => s.snapshotAt))).sort();
    const labels = allTimes.map((t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

    const datasets = Array.from(byUser.values()).map((series, i) => {
      const byTime = new Map(series.points.map((p) => [p.snapshotAt, p.avgReturnPct]));
      return {
        label: series.label,
        data: allTimes.map((t) => byTime.get(t) ?? null),
        borderColor: LINE_COLORS[i % LINE_COLORS.length],
        backgroundColor: "transparent",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
        spanGaps: true,
      };
    });

    chartRef.current = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "rgba(230,235,245,0.85)", boxWidth: 10, font: { size: 11 } } },
          tooltip: {
            backgroundColor: "rgba(15, 20, 34, 0.95)",
            titleColor: "#e6ebf5",
            bodyColor: "#c7d0e3",
            borderColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            padding: 10,
            callbacks: { label: (item) => `${item.dataset.label}: ${formatPct(Number(item.raw))}` },
          },
        },
        scales: {
          x: { ticks: { color: "rgba(148,158,189,0.85)", font: { size: 10 }, maxTicksLimit: 8 }, grid: { display: false } },
          y: {
            grid: { color: "rgba(255,255,255,0.08)" },
            ticks: { color: "rgba(148,158,189,0.85)", font: { size: 11 }, callback: (v) => `${v}%` },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [snapshots]);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Season Race</h3>
      <p className="mb-4 text-xs text-text-muted">average return over time, per manager</p>
      {snapshots.length === 0 ? (
        <p className="text-sm text-text-muted">No snapshots yet -- check back after the next hourly update.</p>
      ) : (
        <div className="h-64">
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
}

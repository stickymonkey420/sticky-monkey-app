"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import LeaderboardTable from "@/components/gameAfi/LeaderboardTable";
import PaperTradingPanel from "@/components/gameAfi/PaperTradingPanel";
import { createClient } from "@/lib/supabase/client";
import { fetchAvailableWeeks, fetchSeasonLeaderboard, fetchWeeklyLeaderboard } from "@/lib/gameAfi/queries";
import type { LeaderboardRow } from "@/lib/gameAfi/types";

// Game-a-Fi: a fantasy-football-style weekly standings board (not
// head-to-head matchups). Two separate games, switched at the top of this
// page:
//   - "Live Portfolio" (Phase 1): ranks members by real portfolio return
//     %. Dollar amounts stay private -- only rank and % are shown (see
//     lib/gameAfi/queries.ts + the game_afi_* SQL functions).
//   - "Paper Trading" (Phase 2): a simulated $10,000 account members trade
//     with, priced off the real stock_universe table. $ amounts are shown
//     here since nothing real is at risk (see
//     components/gameAfi/PaperTradingPanel.tsx + lib/gameAfi/paperQueries.ts
//     + the game_afi_paper_* SQL functions).
// Both are free tier.
function formatWeekLabel(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

export default function GameAFiPage() {
  const [game, setGame] = useState<"live" | "paper">("live");
  const [tab, setTab] = useState<"weekly" | "season">("weekly");
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weeklyRows, setWeeklyRows] = useState<LeaderboardRow[]>([]);

  const [seasonStart, setSeasonStart] = useState<string | null>(null);
  const [seasonRows, setSeasonRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      if (!cancelled) setUserId(user.id);

      const [availableWeeks, weekly, season] = await Promise.all([
        fetchAvailableWeeks(supabase),
        fetchWeeklyLeaderboard(supabase),
        fetchSeasonLeaderboard(supabase),
      ]);
      if (cancelled) return;
      setWeeks(availableWeeks);
      setSelectedWeek(weekly.weekStart);
      setWeeklyRows(weekly.rows);
      setSeasonStart(season.seasonStart);
      setSeasonRows(season.rows);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleWeekChange(weekStart: string) {
    setSelectedWeek(weekStart);
    const supabase = createClient();
    const weekly = await fetchWeeklyLeaderboard(supabase, weekStart);
    setWeeklyRows(weekly.rows);
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Game-a-Fi</h1>
      </div>
      <div className="flex flex-col gap-6">
        <p className="text-sm text-text-muted">
          A weekly standings board, not head-to-head matchups -- every member&apos;s weekly performance shapes their
          placement.
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => setGame("live")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              game === "live" ? "bg-white/10 text-text-primary" : "bg-white/5 text-text-muted hover:bg-white/10"
            }`}
          >
            Live Portfolio
          </button>
          <button
            onClick={() => setGame("paper")}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              game === "paper" ? "bg-white/10 text-text-primary" : "bg-white/5 text-text-muted hover:bg-white/10"
            }`}
          >
            Paper Trading
          </button>
        </div>

        {game === "paper" ? (
          <PaperTradingPanel userId={userId} />
        ) : (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-text-muted">
              Every member&apos;s real portfolio return % for the week shapes their placement. Dollar amounts stay
              private; only rank and % are shown.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setTab("weekly")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  tab === "weekly" ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:bg-white/10"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setTab("season")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                  tab === "season" ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:bg-white/10"
                }`}
              >
                Season Standings
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
                Loading leaderboard…
              </div>
            ) : tab === "weekly" ? (
              <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">Weekly Placement</h3>
                  {weeks.length > 0 && (
                    <select
                      value={selectedWeek ?? ""}
                      onChange={(e) => handleWeekChange(e.target.value)}
                      className="rounded-md border border-card-border bg-[#0f131c] px-3 py-1.5 text-sm text-text-primary outline-none"
                    >
                      {weeks.map((w) => (
                        <option key={w} value={w}>
                          {formatWeekLabel(w)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <LeaderboardTable
                  rows={weeklyRows}
                  currentUserId={userId}
                  emptyLabel="No weekly results yet -- come back once two weeks of portfolio data have been tracked."
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-card-border bg-card-bg p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-text-primary">Season Standings</h3>
                  {seasonStart && (
                    <span className="text-xs text-text-muted">
                      Since{" "}
                      {new Date(`${seasonStart}T00:00:00`).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
                <LeaderboardTable
                  rows={seasonRows}
                  currentUserId={userId}
                  emptyLabel="No season standings yet -- come back once a few weeks of portfolio data have been tracked."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

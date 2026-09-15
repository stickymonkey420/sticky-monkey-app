"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/options/queries";
import { fetchPaperAvailableWeeks, fetchPaperSeasonLeaderboard, fetchPaperWeeklyLeaderboard } from "@/lib/gameAfi/paperQueries";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import type { PaperLeaderboardRow } from "@/lib/gameAfi/paperTypes";
import PaperLeaderboardTable from "./PaperLeaderboardTable";
import PaperTradeWidget from "./PaperTradeWidget";

function formatWeekLabel(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`;
}

// Phase 2: a paper-trading competition alongside Phase 1's live-portfolio
// leaderboard. Everyone starts with $10,000 in simulated cash; trades
// execute server-side (game_afi_paper_execute_trade) at the current
// stock_universe price, so dollar amounts here are safe to show plainly
// -- nothing real is at risk. See migration game_afi_paper_trading_phase2
// and lib/gameAfi/paperQueries.ts.
export default function PaperTradingPanel({ userId }: { userId: string | null }) {
  const { loading, account, trades, holdings, trade } = usePaperTradingAccount(userId);

  const [boardLoading, setBoardLoading] = useState(true);
  const [board, setBoard] = useState<"weekly" | "season">("weekly");
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weeklyRows, setWeeklyRows] = useState<PaperLeaderboardRow[]>([]);
  const [seasonStart, setSeasonStart] = useState<string | null>(null);
  const [seasonRows, setSeasonRows] = useState<PaperLeaderboardRow[]>([]);

  useEffect(() => {
    // No synchronous setState here when userId is absent: the component
    // renders null in that case (see the early return below), so a stale
    // `boardLoading=true` is never actually shown -- same fix as
    // my-business's effect (react-hooks/set-state-in-effect flags any sync
    // setState in an effect body, guard branches included).
    if (!userId) return;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [availableWeeks, weekly, season] = await Promise.all([
        fetchPaperAvailableWeeks(supabase),
        fetchPaperWeeklyLeaderboard(supabase),
        fetchPaperSeasonLeaderboard(supabase),
      ]);
      if (cancelled) return;
      setWeeks(availableWeeks);
      setSelectedWeek(weekly.weekStart);
      setWeeklyRows(weekly.rows);
      setSeasonStart(season.seasonStart);
      setSeasonRows(season.rows);
      setBoardLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function handleWeekChange(weekStart: string) {
    setSelectedWeek(weekStart);
    const supabase = createClient();
    const weekly = await fetchPaperWeeklyLeaderboard(supabase, weekStart);
    setWeeklyRows(weekly.rows);
  }

  if (!userId) return null;

  return (
    <div className="flex flex-col gap-6">
      <PaperTradeWidget loading={loading} account={account} holdings={holdings} trade={trade} />

      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Trade History</h3>
        {trades.length === 0 ? (
          <div className="text-sm text-text-muted">No trades yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Side</th>
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4 text-right">Shares</th>
                  <th className="py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {trades.slice(0, 20).map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap py-2 pr-4 text-text-muted">
                      {new Date(t.trade_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </td>
                    <td
                      className="whitespace-nowrap py-2 pr-4 font-medium"
                      style={{ color: t.side === "buy" ? "#3ddc97" : "#ff5c7a" }}
                    >
                      {t.side === "buy" ? "Buy" : "Sell"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 text-text-primary">{t.ticker}</td>
                    <td className="whitespace-nowrap py-2 pr-4 text-right text-text-primary">{t.shares}</td>
                    <td className="whitespace-nowrap py-2 text-right text-text-primary">{money(t.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setBoard("weekly")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            board === "weekly" ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:bg-white/10"
          }`}
        >
          This Week
        </button>
        <button
          onClick={() => setBoard("season")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            board === "season" ? "bg-[#4f8cff] text-white" : "bg-white/5 text-text-muted hover:bg-white/10"
          }`}
        >
          Season Standings
        </button>
      </div>

      {boardLoading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
          Loading standings…
        </div>
      ) : board === "weekly" ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Paper Trading Weekly Placement</h3>
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
          <PaperLeaderboardTable
            rows={weeklyRows}
            currentUserId={userId}
            emptyLabel="No weekly results yet -- come back once two weeks of paper trading history have been tracked."
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-text-primary">Paper Trading Season Standings</h3>
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
          <PaperLeaderboardTable
            rows={seasonRows}
            currentUserId={userId}
            emptyLabel="No season standings yet -- come back once a few weeks of paper trading history have been tracked."
          />
        </div>
      )}
    </div>
  );
}

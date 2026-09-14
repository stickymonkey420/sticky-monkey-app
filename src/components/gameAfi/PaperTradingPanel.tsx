"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/options/queries";
import {
  computeHoldings,
  ensurePaperAccount,
  executeTrade,
  fetchPaperAvailableWeeks,
  fetchPaperSeasonLeaderboard,
  fetchPaperTrades,
  fetchPaperWeeklyLeaderboard,
} from "@/lib/gameAfi/paperQueries";
import type { PaperAccount, PaperHolding, PaperLeaderboardRow, PaperTrade } from "@/lib/gameAfi/paperTypes";
import PaperLeaderboardTable from "./PaperLeaderboardTable";

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
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [holdings, setHoldings] = useState<PaperHolding[]>([]);

  const [tickerInput, setTickerInput] = useState("");
  const [sharesInput, setSharesInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [board, setBoard] = useState<"weekly" | "season">("weekly");
  const [weeks, setWeeks] = useState<string[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [weeklyRows, setWeeklyRows] = useState<PaperLeaderboardRow[]>([]);
  const [seasonStart, setSeasonStart] = useState<string | null>(null);
  const [seasonRows, setSeasonRows] = useState<PaperLeaderboardRow[]>([]);

  async function refreshAccountAndHoldings() {
    const supabase = createClient();
    const [acct, tradeRows] = await Promise.all([ensurePaperAccount(supabase), fetchPaperTrades(supabase, userId!)]);
    setAccount(acct);
    setTrades(tradeRows);
    setHoldings(await computeHoldings(supabase, tradeRows));
  }

  useEffect(() => {
    // No synchronous setState here when userId is absent: the component
    // renders null in that case (see the early return below), so a stale
    // `loading=true` is never actually shown -- same fix as my-business's
    // effect (react-hooks/set-state-in-effect flags any sync setState in
    // an effect body, guard branches included).
    if (!userId) return;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [acct, tradeRows, availableWeeks, weekly, season] = await Promise.all([
        ensurePaperAccount(supabase),
        fetchPaperTrades(supabase, userId!),
        fetchPaperAvailableWeeks(supabase),
        fetchPaperWeeklyLeaderboard(supabase),
        fetchPaperSeasonLeaderboard(supabase),
      ]);
      if (cancelled) return;
      setAccount(acct);
      setTrades(tradeRows);
      setHoldings(await computeHoldings(supabase, tradeRows));
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
  }, [userId]);

  async function handleWeekChange(weekStart: string) {
    setSelectedWeek(weekStart);
    const supabase = createClient();
    const weekly = await fetchPaperWeeklyLeaderboard(supabase, weekStart);
    setWeeklyRows(weekly.rows);
  }

  async function handleTrade(side: "buy" | "sell") {
    const ticker = tickerInput.trim().toUpperCase();
    const shares = Number(sharesInput);
    if (!ticker) {
      setTradeMessage({ text: "Enter a ticker.", ok: false });
      return;
    }
    if (!(shares > 0)) {
      setTradeMessage({ text: "Enter a number of shares greater than zero.", ok: false });
      return;
    }
    setSubmitting(true);
    setTradeMessage(null);
    const supabase = createClient();
    const result = await executeTrade(supabase, ticker, side, shares);
    setSubmitting(false);
    setTradeMessage({ text: result.message, ok: result.ok });
    if (result.ok) {
      setSharesInput("");
      await refreshAccountAndHoldings();
    }
  }

  if (!userId) return null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        Loading paper trading account…
      </div>
    );
  }

  const holdingsValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
  const totalValue = (account?.cashBalance ?? 0) + holdingsValue;
  const totalReturn = totalValue - (account?.startingBalance ?? 10000);
  const totalReturnPct = account?.startingBalance ? (totalReturn / account.startingBalance) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Cash", value: money(account?.cashBalance ?? 0) },
          { label: "Holdings Value", value: money(holdingsValue) },
          { label: "Portfolio Value", value: money(totalValue) },
          {
            label: "Total Return",
            value: `${totalReturn >= 0 ? "+" : ""}${money(totalReturn)} (${totalReturn >= 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%)`,
            color: totalReturn >= 0 ? "#3ddc97" : "#ff5c7a",
          },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-card-border bg-card-bg p-4">
            <div className="text-xs font-medium uppercase text-text-muted">{tile.label}</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: tile.color ?? undefined }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Place a Trade</h3>
        <p className="mb-3 text-xs text-text-muted">
          Priced at the current tracked price for tickers in the Stock Screener universe (updated every 10 minutes).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Ticker (e.g. AAPL)"
            className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={sharesInput}
            onChange={(e) => setSharesInput(e.target.value)}
            placeholder="Shares"
            type="number"
            min="0"
            step="any"
            className="w-28 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleTrade("buy")}
            className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            Buy
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleTrade("sell")}
            className="rounded-md bg-[#ff5c7a] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            Sell
          </button>
        </div>
        {tradeMessage && (
          <p className={`mt-3 text-sm ${tradeMessage.ok ? "text-[#3ddc97]" : "text-[#ff5c7a]"}`}>
            {tradeMessage.text}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Holdings</h3>
        {holdings.length === 0 ? (
          <div className="text-sm text-text-muted">No open positions yet -- place your first trade above.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                  <th className="py-2 pr-4">Ticker</th>
                  <th className="py-2 pr-4 text-right">Shares</th>
                  <th className="py-2 pr-4 text-right">Avg Cost</th>
                  <th className="py-2 pr-4 text-right">Price</th>
                  <th className="py-2 pr-4 text-right">Value</th>
                  <th className="py-2 text-right">Unrealized</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {holdings.map((h) => (
                  <tr key={h.ticker}>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">{h.ticker}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{h.shares}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{money(h.avgCost)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {h.currentPrice === null ? "—" : money(h.currentPrice)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {h.marketValue === null ? "—" : money(h.marketValue)}
                    </td>
                    <td
                      className="whitespace-nowrap py-2.5 text-right font-medium"
                      style={{ color: (h.unrealizedPl ?? 0) >= 0 ? "#3ddc97" : "#ff5c7a" }}
                    >
                      {h.unrealizedPl === null ? "—" : `${h.unrealizedPl >= 0 ? "+" : ""}${money(h.unrealizedPl)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

      {board === "weekly" ? (
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

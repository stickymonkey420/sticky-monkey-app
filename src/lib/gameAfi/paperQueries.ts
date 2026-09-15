import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExecuteTradeResult,
  PaperAccount,
  PaperHolding,
  PaperLeaderboardRow,
  PaperSeasonLeaderboard,
  PaperTrade,
  PaperWeeklyLeaderboard,
} from "./paperTypes";

// Idempotently provisions (first call) and returns the caller's paper
// account. Safe to call on every page load.
export async function ensurePaperAccount(supabase: SupabaseClient): Promise<PaperAccount | null> {
  const { data, error } = await supabase.rpc("game_afi_paper_ensure_account");
  if (error || !data || data.length === 0) {
    console.error("ensurePaperAccount failed", error);
    return null;
  }
  const row = data[0] as { starting_balance: number; cash_balance: number };
  return { startingBalance: Number(row.starting_balance), cashBalance: Number(row.cash_balance) };
}

export async function fetchPaperTrades(supabase: SupabaseClient, userId: string): Promise<PaperTrade[]> {
  const { data, error } = await supabase
    .from("paper_trades")
    .select("id,ticker,side,shares,price,trade_date")
    .eq("user_id", userId)
    .order("trade_date", { ascending: false });
  if (error) {
    console.error("fetchPaperTrades failed", error);
    return [];
  }
  return (data ?? []) as PaperTrade[];
}

// Same as fetchPaperTrades but scoped to one ticker -- used by the Stock
// Screener ticker card's "Monkey Monkey Avg Cost" box, which only needs
// one ticker's position rather than the whole trade history.
export async function fetchPaperTradesForTicker(
  supabase: SupabaseClient,
  userId: string,
  ticker: string
): Promise<PaperTrade[]> {
  const { data, error } = await supabase
    .from("paper_trades")
    .select("id,ticker,side,shares,price,trade_date")
    .eq("user_id", userId)
    .eq("ticker", ticker)
    .order("trade_date", { ascending: false });
  if (error) {
    console.error("fetchPaperTradesForTicker failed", error);
    return [];
  }
  return (data ?? []) as PaperTrade[];
}

// Net position + simple average cost basis for a single ticker's trades
// (already filtered to one ticker by the caller). Shared by computeHoldings
// (one call per ticker group) and any single-ticker lookup (e.g. the Stock
// Screener ticker card) so the walk-the-trades math lives in one place.
export function computeAvgCost(tradesForOneTicker: PaperTrade[]): { shares: number; avgCost: number } | null {
  // Walk trades oldest-first, maintaining a running average cost basis
  // that only moves on buys -- a sell realizes P&L but doesn't change
  // the remaining shares' average cost, standard simple-average method.
  const chronological = tradesForOneTicker.slice().sort((a, b) => a.trade_date.localeCompare(b.trade_date));
  let shares = 0;
  let avgCost = 0;
  for (const t of chronological) {
    const qty = Number(t.shares);
    const price = Number(t.price);
    if (t.side === "buy") {
      avgCost = shares + qty > 0 ? (avgCost * shares + price * qty) / (shares + qty) : price;
      shares += qty;
    } else {
      shares -= qty;
      if (shares <= 0) {
        shares = 0;
        avgCost = 0;
      }
    }
  }
  return shares > 0 ? { shares, avgCost } : null;
}

// Net position + simple average cost basis per ticker, derived from trade
// history -- there's no separate holdings table. Current price comes from
// stock_universe (same curated, already-synced universe paper trades are
// priced against); a ticker that's since dropped out of stock_universe
// shows a null price/market value rather than a stale or fabricated one.
export async function computeHoldings(supabase: SupabaseClient, trades: PaperTrade[]): Promise<PaperHolding[]> {
  const byTicker = new Map<string, PaperTrade[]>();
  for (const t of trades) {
    const list = byTicker.get(t.ticker) ?? [];
    list.push(t);
    byTicker.set(t.ticker, list);
  }

  const positions: { ticker: string; shares: number; avgCost: number }[] = [];
  for (const [ticker, rows] of byTicker) {
    const net = computeAvgCost(rows);
    if (net) positions.push({ ticker, shares: net.shares, avgCost: net.avgCost });
  }

  if (positions.length === 0) return [];

  const { data, error } = await supabase
    .from("stock_universe")
    .select("ticker,price")
    .in(
      "ticker",
      positions.map((p) => p.ticker)
    );
  const priceByTicker = new Map<string, number>();
  if (!error) {
    for (const row of (data ?? []) as { ticker: string; price: number | null }[]) {
      if (row.price !== null) priceByTicker.set(row.ticker, Number(row.price));
    }
  }

  return positions.map((p) => {
    const currentPrice = priceByTicker.get(p.ticker) ?? null;
    const marketValue = currentPrice === null ? null : currentPrice * p.shares;
    const unrealizedPl = marketValue === null ? null : marketValue - p.avgCost * p.shares;
    return { ticker: p.ticker, shares: p.shares, avgCost: p.avgCost, currentPrice, marketValue, unrealizedPl };
  });
}

export async function executeTrade(
  supabase: SupabaseClient,
  ticker: string,
  side: "buy" | "sell",
  shares: number
): Promise<ExecuteTradeResult> {
  const { data, error } = await supabase.rpc("game_afi_paper_execute_trade", {
    p_ticker: ticker,
    p_side: side,
    p_shares: shares,
  });
  if (error || !data || data.length === 0) {
    console.error("executeTrade failed", error);
    return { ok: false, message: "Could not place the trade. Try again.", newCashBalance: null };
  }
  const row = data[0] as { ok: boolean; message: string; new_cash_balance: number | null };
  return {
    ok: row.ok,
    message: row.message,
    newCashBalance: row.new_cash_balance === null ? null : Number(row.new_cash_balance),
  };
}

export async function fetchPaperWeeklyLeaderboard(
  supabase: SupabaseClient,
  weekStart?: string | null
): Promise<PaperWeeklyLeaderboard> {
  const { data, error } = await supabase.rpc("game_afi_paper_weekly_leaderboard", {
    p_week_start: weekStart ?? null,
  });
  if (error) {
    console.error("fetchPaperWeeklyLeaderboard failed", error);
    return { weekStart: null, rows: [] };
  }
  const rows = (data ?? []) as (PaperLeaderboardRow & { week_start: string })[];
  return {
    weekStart: rows[0]?.week_start ?? weekStart ?? null,
    rows: rows.map(({ user_id, display_name, dollar_return, pct_return, rank }) => ({
      user_id,
      display_name,
      dollar_return,
      pct_return,
      rank,
    })),
  };
}

export async function fetchPaperSeasonLeaderboard(
  supabase: SupabaseClient,
  seasonStart?: string | null
): Promise<PaperSeasonLeaderboard> {
  const { data, error } = await supabase.rpc("game_afi_paper_season_leaderboard", {
    p_season_start: seasonStart ?? null,
  });
  if (error) {
    console.error("fetchPaperSeasonLeaderboard failed", error);
    return { seasonStart: null, rows: [] };
  }
  const rows = (data ?? []) as (PaperLeaderboardRow & { season_start: string })[];
  return {
    seasonStart: rows[0]?.season_start ?? seasonStart ?? null,
    rows: rows.map(({ user_id, display_name, dollar_return, pct_return, rank }) => ({
      user_id,
      display_name,
      dollar_return,
      pct_return,
      rank,
    })),
  };
}

export async function fetchPaperAvailableWeeks(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("game_afi_paper_available_weeks");
  if (error) {
    console.error("fetchPaperAvailableWeeks failed", error);
    return [];
  }
  return ((data ?? []) as { week_start: string }[]).map((r) => r.week_start);
}

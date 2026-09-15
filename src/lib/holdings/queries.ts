import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountTypeOption, Holding } from "./types";

// Read side for the Holdings page: the `positions` table, scoped by
// user_id and optionally narrowed to one account_type -- same shape as
// fetchOpenWheelTrades()/fetchLeapPositions() in src/lib/options/queries.ts.

const HOLDING_COLUMNS = "id,account_type,ticker,asset_class,shares,price,day_change_pct,cost_basis";

export async function fetchHoldings(
  supabase: SupabaseClient,
  userId: string,
  accountType?: string | null
): Promise<Holding[]> {
  let query = supabase.from("positions").select(HOLDING_COLUMNS).eq("user_id", userId);
  if (accountType) {
    query = query.eq("account_type", accountType);
  }
  const { data, error } = await query.order("ticker", { ascending: true });
  return error ? [] : ((data as Holding[]) || []);
}

// Actual (real) average cost for one ticker, across every account_type row
// that holds it -- used by the Stock Screener ticker card's "Actual Avg
// Cost" line (see components/screener/TickerCostAndActions.tsx). Weighted
// by shares rather than a plain average of cost_basis, since the same
// ticker can be split across a brokerage + retirement account at different
// cost bases. Callers are expected to gate this behind a paid-tier check
// first (same as the Invest/Holdings nav group) -- free tier has no real
// holdings tracked in the app at all, so there's nothing meaningful to
// query here for them.
export async function fetchActualAvgCostForTicker(
  supabase: SupabaseClient,
  userId: string,
  ticker: string
): Promise<{ shares: number; avgCost: number } | null> {
  const { data, error } = await supabase
    .from("positions")
    .select("shares,cost_basis")
    .eq("user_id", userId)
    .eq("ticker", ticker);
  if (error || !data || data.length === 0) return null;

  let totalShares = 0;
  let totalCost = 0;
  for (const row of data as { shares: number | string; cost_basis: number | string | null }[]) {
    const shares = Number(row.shares) || 0;
    const costBasis = row.cost_basis === null ? 0 : Number(row.cost_basis) || 0;
    totalShares += shares;
    totalCost += shares * costBasis;
  }
  if (totalShares <= 0) return null;
  return { shares: totalShares, avgCost: totalCost / totalShares };
}

// Unlike the Options page's fetchAccountTypeOptions() (filtered to
// wheel_eligible=true -- that page only cares about accounts that support
// the wheel strategy), Holdings shows positions across every configured
// account, so this fetches the full account_type_options list unfiltered.
// Checked first: the Options query is NOT generic enough to reuse as-is
// because of that filter, so this is a separate (near-identical) query
// rather than an import.
export async function fetchAccountTypeOptions(supabase: SupabaseClient): Promise<AccountTypeOption[]> {
  const { data, error } = await supabase
    .from("account_type_options")
    .select("id,label,hint,wheel_eligible")
    .order("label", { ascending: true });
  return error ? [] : ((data as AccountTypeOption[]) || []);
}

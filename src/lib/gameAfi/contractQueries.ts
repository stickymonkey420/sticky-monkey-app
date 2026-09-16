import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContractType, PaperContractTrade, SellContractResult } from "./contractTypes";

const CONTRACT_COLUMNS =
  "id,ticker,strike,contracts,premium,exp_date,sold_date,contract_type,status,settlement_price,settled_at";

// Current price for one ticker from the curated stock_universe -- the same
// table game_afi_paper_sell_contract itself reads server-side to price a
// sale. Used to drive the "Sell a Contract" form's live premium preview;
// returns null for a ticker that's blank or not in the tracked universe
// rather than throwing, so the preview just stays empty.
export async function fetchTickerPrice(supabase: SupabaseClient, ticker: string): Promise<number | null> {
  const t = ticker.trim().toUpperCase();
  if (!t) return null;
  const { data, error } = await supabase.from("stock_universe").select("price").eq("ticker", t).maybeSingle();
  if (error || !data) return null;
  return Number((data as { price: number }).price);
}

// challengeId null selects the practice account's contract trades; a
// challenge id selects that match's contract trades only -- same scoping
// convention as fetchPaperTrades (paperQueries.ts).
export async function fetchContractTrades(
  supabase: SupabaseClient,
  userId: string,
  challengeId: string | null = null
): Promise<PaperContractTrade[]> {
  let query = supabase
    .from("paper_contract_trades")
    .select(CONTRACT_COLUMNS)
    .eq("user_id", userId)
    .order("sold_date", { ascending: false });
  query = challengeId === null ? query.is("challenge_id", null) : query.eq("challenge_id", challengeId);
  const { data, error } = await query;
  if (error) {
    console.error("fetchContractTrades failed", error);
    return [];
  }
  return (data ?? []) as PaperContractTrade[];
}

// The OPPONENT's contract trades for one accepted "Sell Contracts" match --
// see game_afi_match_opponent_contract_trades. Mirrors fetchOpponentTrades
// (paperQueries.ts): returns [] if the challenge isn't accepted or the
// caller isn't a participant, rather than erroring.
export async function fetchOpponentContractTrades(
  supabase: SupabaseClient,
  challengeId: string
): Promise<PaperContractTrade[]> {
  const { data, error } = await supabase.rpc("game_afi_match_opponent_contract_trades", {
    p_challenge_id: challengeId,
  });
  if (error) {
    console.error("fetchOpponentContractTrades failed", error);
    return [];
  }
  return (data ?? []) as PaperContractTrade[];
}

// contractType defaults to "put" for callers that haven't been updated to
// pass one explicitly. See game_afi_paper_sell_contract: puts lock cash
// collateral, calls require enough uncovered shares held instead --
// enforced server-side either way, and it also rejects any exp_date that
// isn't a Friday.
export async function sellContract(
  supabase: SupabaseClient,
  ticker: string,
  strike: number,
  contracts: number,
  expDate: string,
  challengeId: string | null = null,
  contractType: ContractType = "put"
): Promise<SellContractResult> {
  const { data, error } = await supabase.rpc("game_afi_paper_sell_contract", {
    p_ticker: ticker,
    p_strike: strike,
    p_contracts: contracts,
    p_exp_date: expDate,
    p_challenge_id: challengeId,
    p_contract_type: contractType,
  });
  if (error || !data || data.length === 0) {
    console.error("sellContract failed", error);
    return { ok: false, message: "Could not sell that contract. Try again.", premium: null, newCashBalance: null };
  }
  const row = data[0] as { ok: boolean; message: string; premium: number | null; new_cash_balance: number | null };
  return { ok: row.ok, message: row.message, premium: row.premium, newCashBalance: row.new_cash_balance };
}

// Cash collateral locked by every still-open PUT (strike * contracts * 100)
// -- covered calls never lock cash (they consume share collateral instead,
// see computeCoveredCallShares below), so they're excluded here. Uses the
// server-computed `status` column now that settlement is real (a contract
// past its exp_date but not yet swept by the hourly settlement job is still
// `status='open'`, which is what actually matters for collateral).
export function computeLockedCollateral(trades: PaperContractTrade[]): number {
  return trades
    .filter((t) => t.contract_type === "put" && t.status === "open")
    .reduce((sum, t) => sum + t.strike * t.contracts * 100, 0);
}

// Shares currently obligated to open covered calls (contracts * 100),
// grouped by ticker -- mirrors the coverage check game_afi_paper_sell_contract
// itself runs server-side before allowing a new call, surfaced here so the
// UI can show a member how many of their shares are already spoken for.
export function computeCoveredCallShares(trades: PaperContractTrade[]): Map<string, number> {
  const covered = new Map<string, number>();
  for (const t of trades) {
    if (t.contract_type !== "call" || t.status !== "open") continue;
    covered.set(t.ticker, (covered.get(t.ticker) ?? 0) + t.contracts * 100);
  }
  return covered;
}

// Total premium ever collected, expired or assigned -- premium is credited
// and kept at sale time regardless of outcome at expiration (that's true for
// real options too: assignment changes your shares/cash from the strike,
// not the premium you already pocketed).
export function computeTotalPremium(trades: PaperContractTrade[]): number {
  return trades.reduce((sum, t) => sum + t.premium, 0);
}

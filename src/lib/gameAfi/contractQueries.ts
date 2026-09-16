import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaperContractTrade, SellContractResult } from "./contractTypes";

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
    .select("id,ticker,strike,contracts,premium,exp_date,sold_date")
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

export async function sellContract(
  supabase: SupabaseClient,
  ticker: string,
  strike: number,
  contracts: number,
  expDate: string,
  challengeId: string | null = null
): Promise<SellContractResult> {
  const { data, error } = await supabase.rpc("game_afi_paper_sell_contract", {
    p_ticker: ticker,
    p_strike: strike,
    p_contracts: contracts,
    p_exp_date: expDate,
    p_challenge_id: challengeId,
  });
  if (error || !data || data.length === 0) {
    console.error("sellContract failed", error);
    return { ok: false, message: "Could not sell that contract. Try again.", premium: null, newCashBalance: null };
  }
  const row = data[0] as { ok: boolean; message: string; premium: number | null; new_cash_balance: number | null };
  return { ok: row.ok, message: row.message, premium: row.premium, newCashBalance: row.new_cash_balance };
}

// Collateral (strike * contracts * 100) locked by every still-open
// (exp_date >= today) contract -- computed client-side from the same rows
// fetchContractTrades already returns, the same way incomeTable.ts derives
// real-CSP collateral, rather than a second round-trip RPC.
export function computeLockedCollateral(trades: PaperContractTrade[]): number {
  const todayIso = new Date().toISOString().slice(0, 10);
  return trades.filter((t) => t.exp_date >= todayIso).reduce((sum, t) => sum + t.strike * t.contracts * 100, 0);
}

// Total premium ever collected, expired or not -- this mode's score (see
// ChallengeMemberForm's strategy toggle copy): premium is credited and kept
// at sale time regardless of what happens at expiration, since there's no
// assignment simulation at all.
export function computeTotalPremium(trades: PaperContractTrade[]): number {
  return trades.reduce((sum, t) => sum + t.premium, 0);
}

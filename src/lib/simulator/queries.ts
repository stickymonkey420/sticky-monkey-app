import type { SupabaseClient } from "@supabase/supabase-js";
import type { CspTradeRow } from "./types";

// Real CSP trade history used to suggest a starting weekly return rate
// (see calc.ts computeSuggestedRate). Matches the live script's REST query:
// wheel_trades?user_id=eq.<uid>&trade_type=eq.CSP&select=strike,premium,contracts
export async function fetchCspTrades(supabase: SupabaseClient, userId: string): Promise<CspTradeRow[]> {
  const { data, error } = await supabase
    .from("wheel_trades")
    .select("strike,premium,contracts")
    .eq("user_id", userId)
    .eq("trade_type", "CSP");
  if (error || !data) return [];
  return data as CspTradeRow[];
}

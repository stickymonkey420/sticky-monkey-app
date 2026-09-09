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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetalHolding } from "./types";

// Read-only slice for the Invest page's first (display-only) increment.
// Portfolio donut cards (Brokerage/Traditional IRA/Roth IRA/Crypto) reuse
// fetchHoldings() from @/lib/holdings/queries against the `positions`
// table -- same shape Holdings already reads, no reason to duplicate it
// (re-exported below so callers only need to import from lib/invest).
// The Metals donut + Vault Summary need a separate table, fetched here.

const METAL_HOLDING_COLUMNS =
  "id,user_id,product_name,metal,quantity,ounces,weight_oz,acquisition_cost,current_value,price_per_unit,account_type,category,account_id,purchase_date,storage_location,description";

// Not scoped to account_type="metals" -- a metal holding can also live
// inside "sdira" (self-directed IRA), and the Vault Summary/Metals donut
// are meant to reflect every ounce the user owns regardless of which
// account wrapper holds it (confirmed against live data: some rows are
// account_type="sdira").
export async function fetchMetalHoldings(supabase: SupabaseClient, userId: string): Promise<MetalHolding[]> {
  const { data, error } = await supabase
    .from("metal_holdings")
    .select(METAL_HOLDING_COLUMNS)
    .eq("user_id", userId)
    .order("product_name", { ascending: true });
  return error ? [] : ((data as MetalHolding[]) || []);
}

export { fetchHoldings } from "@/lib/holdings/queries";

// Write side, added for Invest Accounts' "Add Metals" sub-form -- lets a
// newly-created Self-Directed IRA account (manual_accounts,
// category='retirement_account', retirement_type='self_directed_ira',
// ira_asset_type='precious_metals') get its metal holdings tied to it via
// account_id, same table/relationship the Vault Summary already reads
// (fetchMetalHoldings above is not scoped to a single account_id, so this
// row shows up there too once added). RLS: paid/app_director only, same
// as manual_accounts.
export type MetalHoldingInput = {
  product_name: string;
  metal: MetalHolding["metal"];
  quantity: number;
  current_value: number;
  account_type: string;
  account_id: string;
};

export async function addMetalHolding(
  supabase: SupabaseClient,
  userId: string,
  input: MetalHoldingInput
): Promise<{ holding: MetalHolding | null; error: string | null }> {
  const { data, error } = await supabase
    .from("metal_holdings")
    .insert({ ...input, user_id: userId })
    .select(METAL_HOLDING_COLUMNS)
    .single();
  if (error) {
    console.error("addMetalHolding failed", error);
    return { holding: null, error: error.code === "42501" ? "forbidden" : error.message };
  }
  return { holding: data as MetalHolding, error: null };
}

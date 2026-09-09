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

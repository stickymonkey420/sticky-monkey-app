// Row shape for the Invest page's Vault Summary (the `metal_holdings`
// table -- precious-metal holdings, which can live inside either the
// "metals" or "sdira" account_type). Verified column-by-column via the
// Supabase MCP `list_tables` tool against project gxxjxslnsjgsuonnxxgq's
// `metal_holdings` table. Numeric columns are typed `number | string` (not
// just `number`) to match the existing convention (see
// src/lib/options/types.ts) since numeric columns can come back from
// supabase-js as strings.

// Matches the table's `metal` check constraint exactly
// (metal IS NULL OR metal = ANY (...)).
export const METAL_OPTIONS = ["Gold", "Silver", "Platinum", "Palladium", "Copper"] as const;
export type Metal = (typeof METAL_OPTIONS)[number];

export type MetalHolding = {
  id: string;
  user_id: string;
  product_name: string;
  metal: Metal | null;
  quantity: number | string;
  ounces: number | string | null;
  weight_oz: number | string | null;
  acquisition_cost: number | string | null;
  current_value: number | string;
  price_per_unit: number | string | null;
  account_type: string;
  category: string | null;
  account_id: string | null;
  purchase_date: string | null;
  storage_location: string | null;
  description: string | null;
};

// The per-account Portfolio donut cards (Brokerage / Traditional IRA /
// Roth IRA / Crypto) are all backed by the same `positions` table Holdings
// already reads -- reused as-is instead of redefining the same fields
// twice. See src/lib/holdings/types.ts for the source of these.
export type { Holding, HoldingWithDerived } from "@/lib/holdings/types";

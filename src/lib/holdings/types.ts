// Row shapes for the Holdings page (the `positions` table -- equity/crypto
// holdings). `Position` in src/lib/options/types.ts already matches this
// table column-by-column (verified via the Supabase MCP `list_tables`
// tool against project gxxjxslnsjgsuonnxxgq), so `Holding` reuses it
// instead of redefining the same fields twice. `AccountTypeOption` is
// reused the same way -- see src/lib/holdings/queries.ts for why Holdings
// fetches it unfiltered instead of the Options page's wheel_eligible-only
// query.

import type { AccountTypeOption, Position } from "@/lib/options/types";

export type { AccountTypeOption };

export type Holding = Position;

// ---- Derived / view-model type (not a raw table row) ----

export type HoldingWithDerived = Holding & {
  mkt_value: number; // shares * price
  cost_total: number; // shares * cost_basis
  gain_dollar: number; // mkt_value - cost_total
  gain_pct: number | null; // gain_dollar / cost_total * 100; null when cost_total is 0
};

// The two asset classes the Edit Holding modal's dropdown offers. Matches
// the `asset_class` column's default ('equity') -- the schema itself is a
// free-text column, but the app only ever writes one of these two values.
export const ASSET_CLASS_OPTIONS = ["equity", "crypto"] as const;
export type AssetClass = (typeof ASSET_CLASS_OPTIONS)[number];

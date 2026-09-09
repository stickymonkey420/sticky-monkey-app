// Row shapes match the live Supabase schema (project gxxjxslnsjgsuonnxxgq)
// exactly -- verified column-by-column via the Supabase MCP `list_tables`
// tool against `wheel_trades`, `leap_positions`, `positions`, and
// `account_type_options`. Numeric/int columns are typed `number | string`
// (not just `number`) to match the existing dashboard types convention
// (see src/lib/types/dashboard.ts), since numeric columns can come back
// from supabase-js as strings.

export type WheelTradeType = "CSP" | "CC";

export type WheelTradeStatus = "open" | "expired" | "assigned" | "closed" | "rolled";

export type WheelTrade = {
  id: string;
  account_type: string;
  ticker: string;
  trade_type: WheelTradeType;
  strike: number | string;
  premium: number | string;
  contracts: number | string;
  entry_date: string | null;
  exp_date: string | null;
  status: WheelTradeStatus;
  close_date: string | null;
  close_price: number | string | null;
  notes: string | null;
  origin_trade_id: string | null;
};

export type LeapPosition = {
  id: string;
  account_type: string;
  ticker: string;
  strike: number | string;
  expiration_date: string | null;
  contracts: number | string;
  avg_cost: number | string;
  current_price: number | string | null;
  date_bought: string | null;
  notes: string | null;
};

// The `positions` table: equity holdings (used elsewhere to look up a
// ticker's cost basis, e.g. for covered-call "if assigned" math). Not
// queried by this read-only increment, but included per the schema so
// later increments (the Add/Edit modal's cost-basis hint) have it ready.
export type Position = {
  id: string;
  account_type: string;
  ticker: string;
  asset_class: string;
  shares: number | string;
  price: number | string | null;
  day_change_pct: number | string | null;
  cost_basis: number | string | null;
};

export type AccountTypeOption = {
  id: string;
  label: string;
  hint: string | null;
  wheel_eligible: boolean;
};

// ---- Derived / view-model types (not raw table rows) ----

export type OpenPositionKind = "CSP" | "CC" | "LEAP";

// A wheel_trades row and a leap_positions row normalized into one shape for
// the Open Positions table -- mirrors the `wheel`/`leaps` row-building in
// loadPositions() from the live Webflow page's script.
export type OpenPosition = {
  source: "wheel" | "leap";
  id: string;
  ticker: string;
  type: OpenPositionKind;
  strike: number;
  premium: number; // premium/sh (wheel) or avg cost/sh (LEAP)
  contracts: number;
  expiration: string | null;
  entryDate: string | null;
  returnPct: number | null; // premium / strike * 100; null for LEAP
  accountType: string;
  notes: string | null;
  originTradeId: string | null;
};

// Raw columns needed by computePremiumSummary(), fetched separately from
// the open-positions query since it must include closed/rolled/etc. rows.
export type WheelPremiumSummaryRow = {
  premium: number | string | null;
  contracts: number | string | null;
  status: string | null;
  strike: number | string | null;
  trade_type: string | null;
  entry_date: string | null;
  close_date: string | null;
};

export type PremiumSummary = {
  total: number; // month-to-date premium collected (by entry_date)
  realized: number; // year-to-date realized premium (status != "open")
  open: number; // premium collected on still-open ("at risk") trades
  capital: number; // capital at risk on open CSPs: (strike - premium) * contracts * 100
};

export const EMPTY_PREMIUM_SUMMARY: PremiumSummary = {
  total: 0,
  realized: 0,
  open: 0,
  capital: 0,
};

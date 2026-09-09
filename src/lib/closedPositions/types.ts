// Row shapes match the live Supabase schema (project gxxjxslnsjgsuonnxxgq)
// exactly -- verified column-by-column via the Supabase MCP `list_tables`
// tool against `long_option_trades`. `WheelTrade`/`WheelTradeStatus` are
// reused from src/lib/options/types.ts rather than redefined here, since
// closed wheel_trades rows are the exact same table/shape as open ones --
// only the `status` filter differs.

export type { WheelTrade, WheelTradeStatus } from "@/lib/options/types";

// The `long_option_trades` table: standalone long call/put positions
// (buy-to-open, not part of the wheel cycle) -- distinct from both
// `wheel_trades` (CSP/CC premium selling) and `leap_positions` (long-held
// LEAPs with no close workflow, per project doc
// `claude/options-trading-reference.md`). Unlike wheel_trades, this table
// stores `realized_pl` directly as a column -- the closing P&L math is
// computed wherever a row is written to `closed` status, not derived here.
export type LongOptionType = "call" | "put";

export type LongOptionTrade = {
  id: string;
  account_type: string;
  ticker: string;
  option_type: LongOptionType;
  strike: number | string;
  expiration_date: string | null;
  contracts: number | string;
  entry_date: string | null;
  entry_price: number | string | null;
  entry_cost: number | string | null;
  close_date: string | null;
  close_price: number | string | null;
  proceeds: number | string | null;
  status: string;
  realized_pl: number | string | null;
  notes: string | null;
};

// ---- Derived / view-model types (not raw table rows) ----

export type ClosedPositionKind = "CSP" | "CC" | "Long Call" | "Long Put";

// A closed wheel_trades row and a closed long_option_trades row normalized
// into one shape for the Closed Positions table -- mirrors the `wheel`/
// `longs` row-building in loadPositions() from the live Webflow page's
// script (project doc: this page's freeform head code, read via
// data_scripts_tool during this port; not yet saved as its own project doc).
export type ClosedPosition = {
  source: "wheel" | "long";
  id: string;
  ticker: string;
  type: ClosedPositionKind;
  strike: number;
  premCost: number; // premium/sh (wheel) or entry price/sh (long)
  contracts: number;
  closeDate: string | null;
  entryDate: string | null;
  returnPct: number | null; // see calc.ts computeWheelReturnPct / computeLongReturnPct
  status: string; // raw wheel_trades status ("expired"|"assigned"|"closed"), or "closed" for longs
  accountType: string;
  notes: string | null;
};

export const CLOSED_POSITION_ACCOUNTS = ["brokerage", "traditional", "roth"] as const;
export type ClosedPositionAccount = (typeof CLOSED_POSITION_ACCOUNTS)[number];

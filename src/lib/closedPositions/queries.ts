import type { SupabaseClient } from "@supabase/supabase-js";
import type { WheelTrade } from "@/lib/options/types";
import type { ClosedPosition, LongOptionTrade } from "./types";
import { computeLongReturnPct, computeWheelReturnPct } from "./calc";

// Read-only slice ported from the live Webflow Closed Positions page's
// freeform head-code script (read via the Webflow MCP data_scripts_tool
// during this port -- page_id 6a7702a56745d0a69974f850, slug
// /closed-positions). This page is read-only history: no Add/Edit/Roll
// modal exists for it. The one write action in the source script (a
// per-row "Del" button that permanently deletes the closed-trade record)
// is intentionally NOT ported here -- see the port's report for why.
//
// Note the source script loads ALL accounts in a single pair of queries
// (no `account_type` filter) and splits them into brokerage/traditional/
// roth sections client-side -- unlike the Options page's per-account-tab
// queries in src/lib/options/queries.ts. That's mirrored exactly here.

const CLOSED_WHEEL_TRADE_COLUMNS =
  "id,ticker,trade_type,strike,premium,contracts,exp_date,entry_date,close_date,status,account_type,notes,origin_trade_id,close_price";

const CLOSED_LONG_OPTION_COLUMNS =
  "id,ticker,option_type,strike,expiration_date,contracts,entry_date,entry_price,close_date,close_price,realized_pl,entry_cost,account_type,notes";

// Matches the script's `wheel_trades?...&status=in.(expired,assigned,closed)`
// fetch. Deliberately excludes "rolled" -- a rolled leg's history lives in
// the new (still-open, or itself later closed) leg via origin_trade_id,
// not as its own row here, same as the live page.
export async function fetchClosedWheelTrades(
  supabase: SupabaseClient,
  userId: string
): Promise<WheelTrade[]> {
  const { data, error } = await supabase
    .from("wheel_trades")
    .select(CLOSED_WHEEL_TRADE_COLUMNS)
    .eq("user_id", userId)
    .in("status", ["expired", "assigned", "closed"])
    .order("close_date", { ascending: false, nullsFirst: false });
  return error ? [] : ((data as WheelTrade[]) || []);
}

// Matches the script's `long_option_trades?...&status=eq.closed` fetch.
export async function fetchClosedLongOptionTrades(
  supabase: SupabaseClient,
  userId: string
): Promise<LongOptionTrade[]> {
  const { data, error } = await supabase
    .from("long_option_trades")
    .select(CLOSED_LONG_OPTION_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "closed")
    .order("close_date", { ascending: false, nullsFirst: false });
  return error ? [] : ((data as LongOptionTrade[]) || []);
}

// Combines closed wheel_trades + closed long_option_trades into one
// normalized, sortable row shape -- mirrors the `wheel`/`longs` mapping,
// concat, and close-date-desc sort inside loadPositions() in the live
// script.
export function normalizeClosedPositions(
  wheelRows: WheelTrade[],
  longRows: LongOptionTrade[]
): ClosedPosition[] {
  const wheel: ClosedPosition[] = wheelRows.map((r) => {
    const strike = Number(r.strike) || 0;
    const premium = Number(r.premium) || 0;
    return {
      source: "wheel",
      id: r.id,
      ticker: r.ticker,
      type: r.trade_type,
      strike,
      premCost: premium,
      contracts: Number(r.contracts) || 0,
      closeDate: r.close_date,
      entryDate: r.entry_date,
      returnPct: computeWheelReturnPct(strike, premium),
      status: r.status,
      accountType: r.account_type,
      notes: r.notes,
    };
  });

  const longs: ClosedPosition[] = longRows.map((r) => {
    const realizedPl = r.realized_pl === null || r.realized_pl === undefined ? null : Number(r.realized_pl);
    const entryCost = r.entry_cost === null || r.entry_cost === undefined ? null : Number(r.entry_cost);
    return {
      source: "long",
      id: r.id,
      ticker: r.ticker,
      type: r.option_type === "put" ? "Long Put" : "Long Call",
      strike: Number(r.strike) || 0,
      premCost: r.entry_price === null || r.entry_price === undefined ? 0 : Number(r.entry_price),
      contracts: Number(r.contracts) || 0,
      closeDate: r.close_date,
      entryDate: r.entry_date,
      returnPct: computeLongReturnPct(realizedPl, entryCost),
      status: "closed",
      accountType: r.account_type,
      notes: r.notes,
    };
  });

  return wheel
    .concat(longs)
    .sort((a, b) => String(b.closeDate || "").localeCompare(String(a.closeDate || "")));
}

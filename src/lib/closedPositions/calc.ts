import type { ClosedPosition } from "./types";

// Pure calculation/formatting helpers for the Closed Positions page. Kept
// side-effect-free (no Supabase, no fetch) -- same convention as
// src/lib/options/calc.ts -- so they're safe to import from both the real
// components and their QA preview counterparts.
//
// Ported 1:1 from the live Webflow Closed Positions page's freeform head
// code (read via the Webflow MCP data_scripts_tool during this port). Do
// not change this math without re-checking that source: neither formula
// below computes a true realized dollar P&L for wheel_trades -- per the
// project doc `claude/options-trading-reference.md` ("Premium accounting"
// section), the app does not currently capture a closing price/debit for
// wheel_trades, so only Return % (premium / strike) is shown for those
// rows, same as the Open Positions table. long_option_trades is the one
// table that *does* store a real realized-dollar column (`realized_pl`),
// computed wherever that row is written to `closed` -- not derived here.

// Same formula as Open Positions' Return % (src/lib/options/queries.ts
// normalizeOpenPositions / src/lib/options/calc.ts computeReturnPct):
// premium / strike, not annualized, not swapped to equity cost basis.
export function computeWheelReturnPct(strike: number, premium: number): number | null {
  if (!(strike > 0) || Number.isNaN(premium)) return null;
  return (premium / strike) * 100;
}

// long_option_trades stores its own realized_pl and entry_cost columns;
// this just expresses them as a percentage the same way the live script's
// loadPositions() does, without re-deriving realized_pl itself.
export function computeLongReturnPct(
  realizedPl: number | null,
  entryCost: number | null
): number | null {
  if (realizedPl === null || Number.isNaN(realizedPl)) return null;
  if (!entryCost) return null;
  return (realizedPl / entryCost) * 100;
}

// Ported 1:1 from statusLabel() in the live script.
export function statusLabel(p: Pick<ClosedPosition, "source" | "status">): string {
  if (p.source === "long") return "Closed";
  if (p.status === "expired") return "Expired";
  if (p.status === "assigned") return "Assigned";
  if (p.status === "closed") return "Bought to close";
  return p.status || "Closed";
}

// Same three colors as Open Positions' TYPE_COLOR (OpenPositionsTable.tsx)
// / typeColor() in the live script, extended with Long Call/Put -- long
// option trades reuse the CC teal for calls and CSP blue for puts, since
// both are directional single-leg option positions of the same flavor.
export const CLOSED_POSITION_TYPE_COLOR: Record<ClosedPosition["type"], string> = {
  CSP: "#4f8cff", // --accent-blue
  CC: "#34c9c9", // --accent-teal
  "Long Call": "#34c9c9",
  "Long Put": "#4f8cff",
};

import type { Holding, HoldingWithDerived } from "./types";

// Adds the view-model fields the Holdings Summary/Table need on top of a
// raw `positions` row: market value, total cost basis, and gain in
// dollars/percent. Null price/cost_basis (columns are nullable in the
// schema) are treated as 0 for the dollar math, but gain_pct is left
// `null` (not 0) when cost_total is 0 -- dividing by a zero cost basis is
// meaningless, not a 0% gain.
export function withDerived(h: Holding): HoldingWithDerived {
  const shares = Number(h.shares) || 0;
  const price = h.price === null || h.price === undefined ? 0 : Number(h.price) || 0;
  const costBasis = h.cost_basis === null || h.cost_basis === undefined ? 0 : Number(h.cost_basis) || 0;

  const mkt_value = shares * price;
  const cost_total = shares * costBasis;
  const gain_dollar = mkt_value - cost_total;
  const gain_pct = cost_total !== 0 ? (gain_dollar / cost_total) * 100 : null;

  return { ...h, mkt_value, cost_total, gain_dollar, gain_pct };
}

export type SortColumn =
  | "ticker"
  | "asset_class"
  | "shares"
  | "price"
  | "day_change_pct"
  | "cost_basis"
  | "mkt_value"
  | "gain_dollar"
  | "gain_pct";

export type SortDirection = "asc" | "desc";

// Nullable numeric columns (price/day_change_pct/cost_basis/gain_pct) sort
// missing values to the bottom of an ascending sort (and, since direction
// just negates the comparator, to the top of a descending one) rather than
// treating them as 0 and mixing them in with real values.
function numOrMissing(n: number | string | null | undefined): number {
  if (n === null || n === undefined) return Number.NEGATIVE_INFINITY;
  const v = Number(n);
  return Number.isNaN(v) ? Number.NEGATIVE_INFINITY : v;
}

export function compareHoldings(
  a: HoldingWithDerived,
  b: HoldingWithDerived,
  column: SortColumn,
  direction: SortDirection
): number {
  const result =
    column === "ticker" || column === "asset_class"
      ? String(a[column]).localeCompare(String(b[column]))
      : numOrMissing(a[column]) - numOrMissing(b[column]);
  return direction === "asc" ? result : -result;
}

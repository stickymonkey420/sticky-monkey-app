import type { Holding, Metal, MetalHolding } from "./types";

// Donut-grouping helpers for the Invest page's Portfolio Allocation cards.
// Rendering itself reuses the Dashboard Net Worth card's conic-gradient
// approach (src/components/dashboard/NetWorthCard.tsx) -- this module only
// builds the {name, value, color} slice list each card renders.

export type DonutSlice = { name: string; value: number; color: string };
export type DonutResult = { slices: DonutSlice[]; total: number };

const OTHER_LABEL = "Other";
// Muted gray, distinct from every named slice color below -- same role as
// RING_TRACK_COLOR in src/lib/dashboard/expenseCategories.ts (a deliberately
// unobtrusive "not a real category" color).
const OTHER_COLOR = "#5c6478";

// Cycled by rank (largest first) for per-ticker slices, since ticker names
// aren't a fixed known set -- same "fallback palette cycled by slot index"
// approach src/lib/dashboard/expenseCategories.ts uses for its dynamic
// expense-category dials.
const TICKER_COLORS = ["#4f8cff", "#3ddc97", "#a78bfa", "#ff8a65", "#f472b6", "#34c9c9", "#ffb648", "#64d8cb"];

// Fixed per-metal colors (metal is a closed 5-value enum, unlike tickers).
export const METAL_COLORS: Record<Metal, string> = {
  Gold: "#f2c14e",
  Silver: "#c7ccd6",
  Platinum: "#7fd8d0",
  Palladium: "#9b8cff",
  Copper: "#d98a5f",
};

// Slices under this share of the group's total are folded into a single
// "Other" slice so a long tail of tiny positions doesn't crowd the donut
// legend. NOTE: no ported reference script for the Invest page's original
// donut widget was found in the project docs available to this increment
// (unlike Options/Holdings, which do have a live head-code script on
// file) -- 1% was chosen as a conventional, conservative default matching
// the "collapse the noise instead of showing it" idea already used by the
// Dashboard's Expense Categories dials. Flag for confirmation against the
// original Webflow page if/when that script turns up.
const OTHER_THRESHOLD_PCT = 1;

function buildDonut(
  entries: { name: string; value: number }[],
  colorFor: (name: string, rank: number) => string
): DonutResult {
  const positive = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const total = positive.reduce((sum, e) => sum + e.value, 0);
  if (total <= 0) return { slices: [], total: 0 };

  const kept: DonutSlice[] = [];
  let otherValue = 0;
  positive.forEach((e, rank) => {
    const pct = (e.value / total) * 100;
    if (pct < OTHER_THRESHOLD_PCT) {
      otherValue += e.value;
    } else {
      kept.push({ name: e.name, value: e.value, color: colorFor(e.name, rank) });
    }
  });

  if (otherValue > 0) {
    kept.push({ name: OTHER_LABEL, value: otherValue, color: OTHER_COLOR });
  }

  return { slices: kept, total };
}

// Groups one account type's positions by ticker for a Portfolio Allocation
// donut card. Value per ticker is market value (shares * price); when price
// isn't known yet (nullable column), falls back to cost basis
// (shares * cost_basis) instead of dropping the position, so a
// newly-added holding with no live price still shows up on the donut.
export function groupByAccountDonut(holdings: Holding[], accountType: string): DonutResult {
  const entries = holdings
    .filter((h) => h.account_type === accountType)
    .map((h) => {
      const shares = Number(h.shares) || 0;
      const hasPrice = h.price !== null && h.price !== undefined;
      const price = hasPrice ? Number(h.price) || 0 : 0;
      const costBasis = h.cost_basis === null || h.cost_basis === undefined ? 0 : Number(h.cost_basis) || 0;
      const value = hasPrice ? shares * price : shares * costBasis;
      return { name: h.ticker, value };
    });
  return buildDonut(entries, (_name, rank) => TICKER_COLORS[rank % TICKER_COLORS.length]);
}

// Groups every metal holding (across both the "metals" and "sdira" account
// types -- see fetchMetalHoldings()) by metal for the Metals donut card.
// Value per holding is current_value, falling back to acquisition_cost when
// current_value is missing/zero (e.g. a holding just added with no
// appraisal yet).
export function groupMetalsDonut(metalHoldings: MetalHolding[]): DonutResult {
  const totals = new Map<string, number>();
  metalHoldings.forEach((h) => {
    const name = h.metal || OTHER_LABEL;
    const currentValue = Number(h.current_value) || 0;
    const acquisitionCost = Number(h.acquisition_cost) || 0;
    const value = currentValue > 0 ? currentValue : acquisitionCost;
    totals.set(name, (totals.get(name) || 0) + value);
  });
  const entries = Array.from(totals, ([name, value]) => ({ name, value }));
  return buildDonut(entries, (name) => METAL_COLORS[name as Metal] || OTHER_COLOR);
}

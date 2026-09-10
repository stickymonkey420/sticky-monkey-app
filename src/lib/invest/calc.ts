import { CATEGORICAL_PALETTE, MAX_CATEGORICAL_SLICES, OTHER_COLOR } from "@/lib/palette";
import type { Holding, Metal, MetalHolding } from "./types";

// Donut-grouping helpers for the Invest page's Portfolio Allocation cards.
// Rendering itself reuses the Dashboard Net Worth card's conic-gradient
// approach (src/components/dashboard/NetWorthCard.tsx) -- this module only
// builds the {name, value, color} slice list each card renders.
//
// Colors and the top-N-then-Other cap come from src/lib/palette.ts, the ONE
// fixed categorical sequence shared by every chart in this app (Wallet's
// spending donut and debit/credit chart included) -- per the dataviz
// skill's non-negotiable "assign categorical hues in fixed order, never
// cycled." See that file for the validator results.

export type DonutSlice = { name: string; value: number; color: string };
export type DonutResult = { slices: DonutSlice[]; total: number };

const OTHER_LABEL = "Other";

// Fixed per-metal colors: metal is a closed 5-value enum (METAL_OPTIONS in
// ./types.ts), so it gets a fixed identity mapping -- the first 5 slots of
// the SAME categorical order used for ticker ranks above, in the enum's own
// declared order. (Previous version hand-picked "realistic" metal colors --
// e.g. silver #c7ccd6 vs platinum #7fd8d0 -- which the validator fails hard:
// CVD ΔE 1.6, normal-vision ΔE 8.7, both well under the 15 floor. Metal
// identity is already carried by the label text next to each swatch, so
// there's no need to also mimic the metal's real-world color.)
const METAL_ORDER: Metal[] = ["Gold", "Silver", "Platinum", "Palladium", "Copper"];
export const METAL_COLORS: Record<Metal, string> = Object.fromEntries(
  METAL_ORDER.map((metal, i) => [metal, CATEGORICAL_PALETTE[i]])
) as Record<Metal, string>;

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
    if (rank < MAX_CATEGORICAL_SLICES) {
      kept.push({ name: e.name, value: e.value, color: colorFor(e.name, rank) });
    } else {
      otherValue += e.value;
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
  // rank is always < MAX_CATEGORICAL_SLICES here (buildDonut folds anything
  // past that into Other before colorFor would see it), so this is a direct
  // fixed-order lookup -- never a cycle/modulo back to slot 1.
  return buildDonut(entries, (_name, rank) => CATEGORICAL_PALETTE[rank]);
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

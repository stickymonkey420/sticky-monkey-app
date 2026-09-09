import type { Holding, Metal, MetalHolding } from "./types";

// Donut-grouping helpers for the Invest page's Portfolio Allocation cards.
// Rendering itself reuses the Dashboard Net Worth card's conic-gradient
// approach (src/components/dashboard/NetWorthCard.tsx) -- this module only
// builds the {name, value, color} slice list each card renders.

export type DonutSlice = { name: string; value: number; color: string };
export type DonutResult = { slices: DonutSlice[]; total: number };

const OTHER_LABEL = "Other";
// Muted gray, distinct from every categorical slot below -- reserved for
// "not a real category" the same way RING_TRACK_COLOR is used in
// src/lib/dashboard/expenseCategories.ts. Never reused as a real slice color.
const OTHER_COLOR = "#5c6478";

// Fixed, non-cycled categorical order (dark-mode steps -- this app has no
// light theme, see src/app/globals.css). Ported from the dataviz skill's
// reference palette (references/palette.md) and re-validated for this app
// via `node scripts/validate_palette.js "<hexes>" --mode dark`: all 8 pass
// the lightness band, chroma floor, CVD adjacent-separation (worst 8.4),
// normal-vision floor (worst 19.3), and contrast checks. Every categorical
// encoding on this page (per-ticker donut slices AND the fixed metal enum
// below) draws from this SAME sequence and SAME order -- per the skill's
// non-negotiable "assign categorical hues in fixed order, never cycled,"
// a 9th+ series folds into Other rather than generating/repeating a hue.
const CATEGORICAL_PALETTE = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#008300", // 6 green
  "#9085e9", // 7 violet
  "#e66767", // 8 red
];

// Per-ticker slices are ranked largest-first and take the palette in order;
// anything past this rank folds into "Other" instead of generating/cycling
// a 9th color. Capped below the full 8 slots (not just under it) so a
// donut's legend stays scannable -- the original <1%-threshold version let
// well-diversified accounts render 10-13 legend rows, which was the root
// of the "I hate it" feedback.
const MAX_CATEGORICAL_SLICES = 6;

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

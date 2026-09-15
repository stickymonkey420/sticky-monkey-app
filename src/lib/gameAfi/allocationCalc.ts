import { CATEGORICAL_PALETTE, MAX_CATEGORICAL_SLICES, OTHER_COLOR } from "@/lib/palette";
import type { PaperHolding } from "./paperTypes";

// Donut-grouping helpers for the Game-a-Fi Overview page's Allocation and
// Industry Concentration cards. Same shape/rendering as Invest's Portfolio
// Allocation donuts (src/lib/invest/calc.ts, src/components/invest/
// PortfolioDonutCard.tsx) -- this module builds the {name, value, color}
// slice list; PortfolioDonutCard itself is reused unchanged for rendering.
//
// Colors and the top-N-then-Other cap come from src/lib/palette.ts, the ONE
// fixed categorical sequence shared by every chart in this app -- per the
// dataviz skill's non-negotiable "assign categorical hues in fixed order,
// never cycled."

export type DonutSlice = { name: string; value: number; color: string };
export type DonutResult = { slices: DonutSlice[]; total: number };

const OTHER_LABEL = "Other";

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

function holdingValue(h: PaperHolding): number {
  // Market value when the ticker's still priced (stock_universe); falls
  // back to cost basis so a holding never silently drops off the chart just
  // because its price hasn't synced yet.
  return h.marketValue ?? h.avgCost * h.shares;
}

// Per-ticker allocation -- one slice per holding, same convention as
// Invest's groupByAccountDonut.
export function groupHoldingsByTicker(holdings: PaperHolding[]): DonutResult {
  const entries = holdings.map((h) => ({ name: h.ticker, value: holdingValue(h) }));
  return buildDonut(entries, (_name, rank) => CATEGORICAL_PALETTE[rank]);
}

// "Cash green" per your call -- a vivid grass green, distinct from both
// OTHER_COLOR (a gray) and the categorical palette's own dark green (slot 6,
// "#008300") so a top-6 ticker in that slot never gets confused with the
// Cash row sitting next to it in the legend.
export const CASH_COLOR = "#22c55e";
const CASH_LABEL = "Cash";

// Appends a "Cash" row after whatever groupHoldingsByTicker already built --
// always last, regardless of size, per your call to add it "at the bottom
// of holdings" rather than ranked in with the tickers (a mostly-cash
// account would otherwise put Cash first, which reads oddly next to a
// holdings breakdown). No-ops when there's no meaningful cash balance so an
// all-invested account's donut isn't padded with a $0 slice.
export function appendCash(result: DonutResult, cashBalance: number): DonutResult {
  if (cashBalance <= 0) return result;
  return {
    slices: [...result.slices, { name: CASH_LABEL, value: cashBalance, color: CASH_COLOR }],
    total: result.total + cashBalance,
  };
}

// Applies a member's own per-name color overrides (see tickerColors.ts /
// the game_afi_ticker_colors table) on top of whatever buildDonut/appendCash
// already assigned -- a plain post-process step rather than threading the
// override map through colorFor, so it works identically for ticker slices,
// Cash, and "Other" without buildDonut needing to know overrides exist.
// Personal to the viewing member: the same override is applied whether the
// name shows up on their own donut or their opponent's (see the Overview
// page), so a ticker keeps one consistent color across the whole page.
export function applyColorOverrides(result: DonutResult, overrides: Map<string, string>): DonutResult {
  if (overrides.size === 0) return result;
  return {
    ...result,
    slices: result.slices.map((s) => (overrides.has(s.name) ? { ...s, color: overrides.get(s.name)! } : s)),
  };
}

// Industry concentration -- same holdings, grouped by stock_universe.industry
// instead of ticker, so a member can see how much of a match's capital rides
// on one industry regardless of how many different tickers it's split
// across. A ticker whose industry hasn't synced (or that's since dropped out
// of stock_universe) folds into "Unknown" rather than disappearing. Uses the
// full Finnhub taxonomy label as-is (e.g. "Drug Manufacturers—General") --
// an earlier pass shortened these for a donut legend, but per your call to
// revert to the descriptive names now that this renders as a bar list
// (IndustryBarChart) with a full-width label line above each bar instead of
// a cramped legend row.
export function groupHoldingsByIndustry(
  holdings: PaperHolding[],
  industryByTicker: Map<string, string | null>
): DonutResult {
  const totals = new Map<string, number>();
  holdings.forEach((h) => {
    const industry = industryByTicker.get(h.ticker) || "Unknown";
    totals.set(industry, (totals.get(industry) || 0) + holdingValue(h));
  });
  const entries = Array.from(totals, ([name, value]) => ({ name, value }));
  return buildDonut(entries, (_name, rank) => CATEGORICAL_PALETTE[rank]);
}

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

// stock_universe.industry is Finnhub's full taxonomy label (e.g. "Drug
// Manufacturers—General", "Information Technology Services") -- fine as
// data, too long as a donut legend row. Explicit overrides for every
// industry actually present in stock_universe as of this migration (see
// `select distinct industry from stock_universe`), so the abbreviation is a
// deliberate editorial choice rather than a truncation guess; anything not
// in this list (a ticker the universe adds later, in a new industry) falls
// back to a plain character-count truncation rather than crashing or
// showing nothing.
const INDUSTRY_LABEL_OVERRIDES: Record<string, string> = {
  "Asset Management": "Asset Mgmt",
  "Banks—Diversified": "Banks",
  "Beverages—Non-Alcoholic": "Beverages",
  "Communication Equipment": "Comm. Equipment",
  "Diagnostics & Research": "Diagnostics",
  "Drug Manufacturers—General": "Drug Manufacturers",
  "Farm & Heavy Construction Machinery": "Heavy Machinery",
  "Footwear & Accessories": "Footwear",
  "Home Improvement Retail": "Home Improvement",
  "Household & Personal Products": "Household Products",
  "Information Technology Services": "IT Services",
  "Integrated Freight & Logistics": "Freight & Logistics",
  "Internet Content & Information": "Internet Content",
  "Oil & Gas Equipment & Services": "Oil & Gas Equipment",
  "REIT—Industrial": "REIT (Industrial)",
  "REIT—Retail": "REIT (Retail)",
  "REIT—Specialty": "REIT (Specialty)",
  "Software—Application": "Software (App)",
  "Software—Infrastructure": "Software (Infra)",
  "Specialty Chemicals": "Chemicals",
  "Utilities—Regulated Electric": "Utilities (Electric)",
};
const INDUSTRY_LABEL_MAX = 22;

function shortenIndustry(name: string): string {
  const mapped = INDUSTRY_LABEL_OVERRIDES[name] ?? name;
  return mapped.length > INDUSTRY_LABEL_MAX ? `${mapped.slice(0, INDUSTRY_LABEL_MAX - 1)}…` : mapped;
}

// Industry concentration -- same holdings, grouped by stock_universe.industry
// instead of ticker, so a member can see how much of a match's capital rides
// on one industry regardless of how many different tickers it's split
// across. A ticker whose industry hasn't synced (or that's since dropped out
// of stock_universe) folds into "Unknown" rather than disappearing.
export function groupHoldingsByIndustry(
  holdings: PaperHolding[],
  industryByTicker: Map<string, string | null>
): DonutResult {
  const totals = new Map<string, number>();
  holdings.forEach((h) => {
    const industry = shortenIndustry(industryByTicker.get(h.ticker) || "Unknown");
    totals.set(industry, (totals.get(industry) || 0) + holdingValue(h));
  });
  const entries = Array.from(totals, ([name, value]) => ({ name, value }));
  return buildDonut(entries, (_name, rank) => CATEGORICAL_PALETTE[rank]);
}

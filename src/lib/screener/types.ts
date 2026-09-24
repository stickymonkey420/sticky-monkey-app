// Port of the live Webflow "Stock Screener" page (page id
// 6a75af701b806a8688055696). Row shape matches the `stock_universe` table
// exactly (verified via Supabase list_tables/information_schema).
export type StockUniverseRow = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  price: number | null;
  day_change_pct: number | null;
  market_cap: number | null; // millions USD (Finnhub convention)
  pe_ratio: number | null;
  dividend_yield: number | null;
  week52_high: number | null;
  week52_low: number | null;
  volume: number | null;
  beta: number | null;
};

export type CapFilter = "" | "large" | "mid" | "small";
export type PeFilter = "" | "under15" | "15to25" | "25to40" | "over40";
export type PriceFilter = "" | "under50" | "50to150" | "150to300" | "over300";
export type SortKey = "cap_desc" | "price_desc" | "pe_asc" | "chg_desc" | "ticker_asc";

export type ScreenerFilters = {
  sector: string; // "" = all
  cap: CapFilter;
  pe: PeFilter;
  price: PriceFilter;
  sort: SortKey;
};

export const DEFAULT_FILTERS: ScreenerFilters = {
  sector: "",
  cap: "",
  pe: "",
  price: "",
  sort: "cap_desc",
};

// Shape returned by the `ticker-quote-lookup` edge function (verified via
// Supabase get_edge_function against the deployed source).
export type ExtendedQuote = {
  label: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
};

export type MarketState = "PRE" | "REGULAR" | "POST" | "CLOSED";

// Same-industry comparison for the Sticky Monkey Score, computed server-side
// from Finnhub's peer list (up to 6 peers, each scored the same way as the
// searched ticker) -- see the `ticker-quote-lookup` edge function.
// industryAvgScore/industryName are independently null-able: a ticker can
// have a known industry name with too few peers to average, or vice versa.
export type IndustryComparison = {
  industryName: string | null;
  peerCount: number;
  industryAvgScore: number | null; // 0-100, average Sticky Monkey Score across peerCount peers
};

export type TickerQuoteResult = {
  symbol: string;
  companyName: string | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  previousClose: number | null;
  quoteTime: string | null;
  marketState: MarketState;
  extended: ExtendedQuote | null;
  peRatio: number | null;
  pegRatio: number | null;
  pegSource: "trailing" | "forward" | "estimated" | null;
  // Why pegRatio is null when a PEG existed but was rejected as not
  // meaningful (earnings growth off a near-zero base, or distorted by a
  // one-time tax benefit). Null when PEG is shown or simply unavailable.
  pegNote?: string | null;
  debtToEquity: number | null;
  returnOnEquity: number | null; // Finnhub roeTTM/roeRfy, as a percent (e.g. 24.5 = 24.5%)
  currentRatio: number | null; // Finnhub currentRatioQuarterly/currentRatioAnnual
  returnOnAssets: number | null; // Finnhub roaTTM/roaRfy, as a percent
  netProfitMargin: number | null; // Finnhub netProfitMarginTTM/netProfitMarginAnnual, as a percent
  priceToFreeCashFlow: number | null; // Finnhub pfcfShareTTM/pfcfShareAnnual
  // v6: composite score tallying the 7 gauges above (0-100, higher is
  // better), plus how the ticker's industry peers score on average, plus a
  // Graham Number intrinsic value estimate. See the edge function for the
  // full methodology notes.
  stickyMonkeyScore: number | null;
  intrinsicValue: number | null; // Graham Number, $/share
  intrinsicValueMethod: "graham" | null;
  intrinsicValueNote: string | null; // why intrinsicValue is null, when it is
  industry: IndustryComparison | null;
  // Present when reported earnings were boosted by a one-time tax benefit
  // (after-tax margin above before-tax margin). Net margin, ROE, ROA, P/E and
  // the Graham Number in this result are already re-based on a normal tax rate.
  taxAdjustment?: TaxAdjustment | null;
};

export type TaxAdjustment = {
  applied: boolean;
  reportedNetMargin: number | null;
  pretaxMargin: number | null;
  adjustedNetMargin: number | null;
  normalTaxRatePct: number;
  reportedPeRatio: number | null;
  note: string;
};

export type TickerLookupError = "invalid_symbol" | "not_found" | "failed";

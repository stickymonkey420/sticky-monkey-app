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
  debtToEquity: number | null;
};

export type TickerLookupError = "invalid_symbol" | "not_found" | "failed";

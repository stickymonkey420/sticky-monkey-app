import type { CapFilter, PeFilter, PriceFilter, ScreenerFilters, SortKey, StockUniverseRow } from "./types";

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Finnhub reports market_cap in millions USD -- ported verbatim from the
// live script's marketCapFmt().
export function marketCapFmt(m: number | null | undefined): string {
  if (m === null || m === undefined || Number.isNaN(m)) return "—";
  const usd = Number(m) * 1e6;
  if (usd >= 1e12) return "$" + (usd / 1e12).toFixed(2) + "T";
  if (usd >= 1e9) return "$" + (usd / 1e9).toFixed(1) + "B";
  if (usd >= 1e6) return "$" + (usd / 1e6).toFixed(0) + "M";
  return "$" + usd.toFixed(0);
}

export type ColoredPct = { text: string; color: string };

const POSITIVE = "#3ddc97";
const NEGATIVE = "#ff5c5c";
const NEUTRAL = "hsla(223.9,28.67%,71.96%,1)";

// Same up/down arrow + color convention as the live script's pctFmt().
export function pctColored(n: number | null | undefined): ColoredPct {
  if (n === null || n === undefined || Number.isNaN(n)) return { text: "—", color: NEUTRAL };
  const v = Number(n);
  const color = v > 0 ? POSITIVE : v < 0 ? NEGATIVE : NEUTRAL;
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "";
  return { text: `${arrow} ${Math.abs(v).toFixed(2)}%`.trim(), color };
}

export function changeColored(change: number | null | undefined, changePct: number | null | undefined): ColoredPct {
  if (change === null || change === undefined || Number.isNaN(change)) return { text: "—", color: NEUTRAL };
  const v = Number(change);
  const color = v > 0 ? POSITIVE : v < 0 ? NEGATIVE : NEUTRAL;
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "";
  const pct = changePct === null || changePct === undefined ? "" : ` (${Math.abs(Number(changePct)).toFixed(2)}%)`;
  return { text: `${arrow} ${money(Math.abs(v))}${pct}`.trim(), color };
}

export function num1(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toFixed(1);
}

export function pctPlain(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toFixed(2) + "%";
}

export type ScoreBand = { label: string; color: string };

// Descriptive label for the Sticky Monkey Score -- same green/yellow/orange/
// red semantics already used across the 7 gauges it's tallied from.
// Describes the fundamentals only; deliberately not phrased as a buy/sell
// call.
export function scoreBand(score: number | null | undefined): ScoreBand {
  if (score === null || score === undefined || Number.isNaN(score)) return { label: "—", color: NEUTRAL };
  const s = Number(score);
  if (s >= 80) return { label: "Excellent fundamentals", color: "#3ddc97" };
  if (s >= 60) return { label: "Solid fundamentals", color: "#3ddc97" };
  if (s >= 40) return { label: "Mixed fundamentals", color: "#ffd93d" };
  if (s >= 20) return { label: "Weak fundamentals", color: "#e67e22" };
  return { label: "Poor fundamentals", color: "#ff5c5c" };
}

export const MARKET_STATE_LABELS: Record<string, string> = {
  REGULAR: "Market open",
  PRE: "Pre-market",
  POST: "After-hours",
  CLOSED: "Market closed",
};

export const CAP_OPTIONS: { value: CapFilter; label: string }[] = [
  { value: "", label: "All market caps" },
  { value: "large", label: "Large cap (>$10B)" },
  { value: "mid", label: "Mid cap ($2B–$10B)" },
  { value: "small", label: "Small cap (<$2B)" },
];

export const PE_OPTIONS: { value: PeFilter; label: string }[] = [
  { value: "", label: "All P/E" },
  { value: "under15", label: "Under 15" },
  { value: "15to25", label: "15 – 25" },
  { value: "25to40", label: "25 – 40" },
  { value: "over40", label: "Over 40" },
];

export const PRICE_OPTIONS: { value: PriceFilter; label: string }[] = [
  { value: "", label: "All prices" },
  { value: "under50", label: "Under $50" },
  { value: "50to150", label: "$50 – $150" },
  { value: "150to300", label: "$150 – $300" },
  { value: "over300", label: "Over $300" },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "cap_desc", label: "Market cap (high to low)" },
  { value: "price_desc", label: "Price (high to low)" },
  { value: "pe_asc", label: "P/E (low to high)" },
  { value: "chg_desc", label: "Day change % (high to low)" },
  { value: "ticker_asc", label: "Ticker (A–Z)" },
];

// Ported 1:1 from the live script's passesFilters().
export function passesFilters(r: StockUniverseRow, f: ScreenerFilters): boolean {
  if (f.sector && r.sector !== f.sector) return false;

  if (f.cap) {
    const mc = r.market_cap === null || r.market_cap === undefined ? null : Number(r.market_cap);
    if (mc === null) return false;
    if (f.cap === "large" && !(mc > 10000)) return false;
    if (f.cap === "mid" && !(mc >= 2000 && mc <= 10000)) return false;
    if (f.cap === "small" && !(mc < 2000)) return false;
  }

  if (f.pe) {
    const p = r.pe_ratio === null || r.pe_ratio === undefined ? null : Number(r.pe_ratio);
    if (p === null) return false;
    if (f.pe === "under15" && !(p < 15)) return false;
    if (f.pe === "15to25" && !(p >= 15 && p <= 25)) return false;
    if (f.pe === "25to40" && !(p > 25 && p <= 40)) return false;
    if (f.pe === "over40" && !(p > 40)) return false;
  }

  if (f.price) {
    const pr = r.price === null || r.price === undefined ? null : Number(r.price);
    if (pr === null) return false;
    if (f.price === "under50" && !(pr < 50)) return false;
    if (f.price === "50to150" && !(pr >= 50 && pr <= 150)) return false;
    if (f.price === "150to300" && !(pr > 150 && pr <= 300)) return false;
    if (f.price === "over300" && !(pr > 300)) return false;
  }

  return true;
}

// Ported 1:1 from the live script's sortRows().
export function sortRows(rows: StockUniverseRow[], sort: SortKey): StockUniverseRow[] {
  const withDefault = (v: number | null | undefined, d: number) => (v === null || v === undefined ? d : Number(v));
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    switch (sort) {
      case "price_desc":
        return withDefault(b.price, -Infinity) - withDefault(a.price, -Infinity);
      case "pe_asc":
        return withDefault(a.pe_ratio, Infinity) - withDefault(b.pe_ratio, Infinity);
      case "chg_desc":
        return withDefault(b.day_change_pct, -Infinity) - withDefault(a.day_change_pct, -Infinity);
      case "ticker_asc":
        return String(a.ticker).localeCompare(String(b.ticker));
      case "cap_desc":
      default:
        return withDefault(b.market_cap, -Infinity) - withDefault(a.market_cap, -Infinity);
    }
  });
  return sorted;
}

export function filterAndSort(rows: StockUniverseRow[], f: ScreenerFilters): StockUniverseRow[] {
  return sortRows(rows.filter((r) => passesFilters(r, f)), f.sort);
}

// Sector dropdown options aren't hardcoded in the live script (it reads a
// static Webflow-authored <select>, not shown in the custom-code source) --
// derived here from whatever sectors are actually present in the fetched
// universe, so the filter never drifts from the real data.
export function distinctSectors(rows: StockUniverseRow[]): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    if (r.sector) set.add(r.sector);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StockUniverseRow, TickerQuoteResult } from "./types";

// stock_universe is readable by any authenticated user (RLS: "Authenticated
// users can read stock universe", USING true) -- no account/user filter
// needed, unlike every other query in this app. Matches the live script's
// `stock_universe?select=*&order=market_cap.desc.nullslast`.
export async function fetchStockUniverse(supabase: SupabaseClient): Promise<StockUniverseRow[]> {
  const { data, error } = await supabase
    .from("stock_universe")
    .select("*")
    .order("market_cap", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("fetchStockUniverse failed", error);
    return [];
  }
  return (data ?? []) as StockUniverseRow[];
}

export type TickerLookupResult =
  | { ok: true; data: TickerQuoteResult }
  | { ok: false; kind: "invalid_symbol" | "not_found" | "failed" };

// Full-shape ticker lookup for the screener's search card (price, change,
// market state, extended-hours tick, PEG + Debt/Equity for the gauges).
// This is a separate call from lib/options/priceQuotes.ts's fetchQuote()
// (which only needs {price} for Options' cost-basis/roll math and caches
// per-ticker for the life of the page) -- the screener wants the full
// response every search, uncached, same as the live script's doSearch().
// Called directly via fetch() with the user's access token, same
// convention as fetchQuote(), since supabase.functions.invoke() doesn't
// cleanly support a GET with query-string params.
export async function fetchTickerQuote(supabase: SupabaseClient, symbolRaw: string): Promise<TickerLookupResult> {
  const symbol = (symbolRaw || "").trim().toUpperCase();
  if (!symbol) return { ok: false, kind: "invalid_symbol" };

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, kind: "failed" };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  try {
    const res = await fetch(`${base}/functions/v1/ticker-quote-lookup?symbol=${encodeURIComponent(symbol)}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 404) return { ok: false, kind: "not_found" };
    if (res.status === 400) return { ok: false, kind: "invalid_symbol" };
    if (!res.ok) return { ok: false, kind: "failed" };
    const data = (await res.json()) as TickerQuoteResult;
    return { ok: true, data };
  } catch (e) {
    console.error("fetchTickerQuote failed", e);
    return { ok: false, kind: "failed" };
  }
}

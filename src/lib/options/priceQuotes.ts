import type { SupabaseClient } from "@supabase/supabase-js";

// Thin wrapper around the `ticker-quote-lookup` edge function (same
// $0-cost Finnhub-backed source used by the Stock Screener page and, in
// the live Webflow script, by the Roll/Buy-to-Close modals and the Open
// Positions "Current Price" column). Called directly via fetch() with the
// user's own access token -- same convention already used elsewhere in
// this app (see QuickAccessCard's plaid-* calls) -- rather than
// supabase.functions.invoke(), since that helper doesn't cleanly support
// a GET request with query-string params.

export type Quote = { price: number };

// Per-page-load cache keyed by ticker: a symbol requested more than once
// while the page is open (e.g. shown in multiple Open Positions rows, or
// the Roll and Add Trade modals both touching the same ticker) reuses the
// in-flight/settled request instead of re-invoking the edge function.
// Module-level, so it's shared for the life of the page load and cleared
// only on a full reload -- exactly the "don't hammer it for the same
// ticker repeatedly within one page load" behavior asked for. A failed
// lookup is evicted immediately so the next call can retry rather than
// being stuck returning null for the rest of the session.
const quoteCache = new Map<string, Promise<Quote | null>>();

export function clearQuoteCache(): void {
  quoteCache.clear();
}

export async function fetchQuote(
  supabase: SupabaseClient,
  symbolRaw: string
): Promise<Quote | null> {
  const symbol = (symbolRaw || "").trim().toUpperCase();
  if (!symbol) return null;

  const cached = quoteCache.get(symbol);
  if (cached) return cached;

  const promise = (async (): Promise<Quote | null> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return null;

      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(
        `${base}/functions/v1/ticker-quote-lookup?symbol=${encodeURIComponent(symbol)}`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (!res.ok) return null;
      const body = await res.json();
      if (!body || body.error || typeof body.price !== "number") return null;
      return { price: body.price };
    } catch {
      return null;
    }
  })();

  quoteCache.set(symbol, promise);
  const result = await promise;
  if (result === null) quoteCache.delete(symbol);
  return result;
}

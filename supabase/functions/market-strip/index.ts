// Supabase Edge Function: market-strip
// Powers the "SM Markets" ticker strip in the app's top bar: S&P 500, Dow 30,
// Nasdaq, Russell 2000, 10-Yr yield, VIX, Gold, Bitcoin and Crude -- last
// price, change vs previous close, and a small intraday sparkline.
//
// Cost: $0. Data comes from Yahoo Finance's public chart endpoint (no key).
// Results are cached in the function's memory for CACHE_MS, so however many
// members have the app open, Yahoo sees at most ~1 request per symbol per
// minute per warm instance, and Supabase's free tier (500k invocations/mo)
// is nowhere near touched by a 60s client poll. Signed-in users only
// (verify_jwt) and CORS limited to the app's own origins.
//
// Any symbol that fails comes back as null so one bad feed never blanks
// the whole strip; if Yahoo is down entirely the last good snapshot is
// served (marked stale) rather than an error.

const ALLOWED_ORIGINS = new Set([
  "https://app.stickymonkey.net",
  "https://sticky-monkey-app.vercel.app",
]);

const SYMBOLS: Array<{ key: string; label: string; symbol: string; decimals: number }> = [
  { key: "spx", label: "S&P 500", symbol: "^GSPC", decimals: 2 },
  { key: "dji", label: "Dow 30", symbol: "^DJI", decimals: 2 },
  { key: "ixic", label: "Nasdaq", symbol: "^IXIC", decimals: 2 },
  { key: "rut", label: "Russell 2000", symbol: "^RUT", decimals: 2 },
  { key: "tnx", label: "10-Yr Yield", symbol: "^TNX", decimals: 3 },
  { key: "vix", label: "VIX", symbol: "^VIX", decimals: 2 },
  { key: "gold", label: "Gold", symbol: "GC=F", decimals: 2 },
  { key: "btc", label: "Bitcoin", symbol: "BTC-USD", decimals: 2 },
  { key: "oil", label: "Crude Oil", symbol: "CL=F", decimals: 2 },
];

const CACHE_MS = 60_000;
const SPARK_POINTS = 48;

type Quote = {
  key: string;
  label: string;
  symbol: string;
  decimals: number;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  spark: number[];
  marketState: string | null;
};

let cache: { at: number; quotes: Array<Quote | null> } | null = null;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function downsample(values: number[], n: number): number[] {
  if (values.length <= n) return values;
  const out: number[] = [];
  const step = (values.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(values[Math.round(i * step)]);
  return out;
}

async function fetchQuote(s: (typeof SYMBOLS)[number]): Promise<Quote | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.symbol)}` +
    `?range=1d&interval=5m&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StickyMonkeyFinance/1.0)", Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error("yahoo_http", s.symbol, res.status);
      return null;
    }
    const json = await res.json();
    const r = json?.chart?.result?.[0];
    const meta = r?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prevClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) return null;
    const closes: number[] = (r?.indicators?.quote?.[0]?.close ?? []).filter(
      (v: unknown) => typeof v === "number" && Number.isFinite(v),
    );
    const change = price - prevClose;
    return {
      key: s.key,
      label: s.label,
      symbol: s.symbol,
      decimals: s.decimals,
      price,
      prevClose,
      change,
      changePct: (change / prevClose) * 100,
      spark: downsample(closes.length ? closes : [prevClose, price], SPARK_POINTS).map((v) => Math.round(v * 1000) / 1000),
      marketState: typeof meta?.marketState === "string" ? meta.marketState : null,
    };
  } catch (e) {
    console.error("yahoo_fetch", s.symbol, String(e));
    return null;
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const now = Date.now();
  let stale = false;
  if (!cache || now - cache.at > CACHE_MS) {
    const quotes = await Promise.all(SYMBOLS.map(fetchQuote));
    if (quotes.some(Boolean)) {
      // Keep the previous value for any single symbol that failed this round.
      const merged = quotes.map((q, i) => q ?? cache?.quotes[i] ?? null);
      cache = { at: now, quotes: merged };
    } else if (cache) {
      stale = true;
    } else {
      return new Response(JSON.stringify({ quotes: [], asOf: null, stale: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ quotes: cache!.quotes, asOf: new Date(cache!.at).toISOString(), stale }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "private, max-age=30" },
  });
});

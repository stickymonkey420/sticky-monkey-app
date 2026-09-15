"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { changeColored, MARKET_STATE_LABELS, money, scoreBand } from "@/lib/screener/calc";
import {
  CURRENT_RATIO_GAUGE_CONFIG,
  DEBT_EQUITY_GAUGE_CONFIG,
  NET_PROFIT_MARGIN_GAUGE_CONFIG,
  PEG_GAUGE_CONFIG,
  PRICE_FCF_GAUGE_CONFIG,
  ROA_GAUGE_CONFIG,
  ROE_GAUGE_CONFIG,
} from "@/lib/screener/gauge";
import { fetchTickerQuote } from "@/lib/screener/queries";
import type { TickerQuoteResult } from "@/lib/screener/types";
import type { Role } from "@/lib/usersGroups/types";
import Gauge from "./Gauge";
import { AverageCostOwnedCard, BuyButton } from "./TickerCostAndActions";

// Port of the live script's ticker-search widget: a single input + button
// hitting the `ticker-quote-lookup` edge function, rendering a price card
// plus the two Peter Lynch gauges. Ported 1:1 down to the 4-column grid
// (ticker card spans columns 1-2, gauges stack in column 2).
export default function TickerLookup() {
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<TickerQuoteResult | null>(null);

  // Signed-in user id + tier, fetched once and shared by both
  // AverageCostOwnedCard and BuyButton below instead of each fetching its
  // own copy.
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setUserId(null);
        return;
      }
      setUserId(user.id);
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!cancelled && data) setRole((data as { role: Role }).role);
    }
    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  async function doSearch() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setResult(null);
    setStatus(`Looking up ${sym}…`);
    const supabase = createClient();
    const res = await fetchTickerQuote(supabase, sym);
    if (!res.ok) {
      if (res.kind === "not_found") setStatus(`${sym} not found. Check the ticker and try again.`);
      else if (res.kind === "invalid_symbol") setStatus("Enter a valid ticker symbol.");
      else setStatus("Could not look up that ticker right now. Try again in a moment.");
      return;
    }
    setStatus("");
    setResult(res.data);
  }

  let quoteTimeStr = "—";
  if (result?.quoteTime) {
    try {
      quoteTimeStr = new Date(result.quoteTime).toLocaleString();
    } catch {
      quoteTimeStr = "—";
    }
  }

  const change = result ? changeColored(result.change, result.changePct) : null;
  const extendedChange = result?.extended ? changeColored(result.extended.change, result.extended.changePct) : null;

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Ticker Lookup</h3>
      <p className="mb-4 text-xs text-text-muted">
        Live quote plus 7 gauges for any ticker: Peter Lynch-style PEG and Debt/Equity valuation, Return on Equity,
        Return on Assets, Current Ratio, Net Profit Margin, and Price/Free Cash Flow -- tallied into a Sticky Monkey
        Score, compared against the ticker&apos;s industry peers, alongside a Graham Number intrinsic value estimate.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              doSearch();
            }
          }}
          placeholder="Ticker symbol (e.g. AAPL)"
          className="min-w-0 flex-1 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm uppercase text-text-primary outline-none"
        />
        <button
          type="button"
          onClick={doSearch}
          className="rounded-md px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: "#4f8cff" }}
        >
          Search
        </button>
      </div>

      {status && <div className="mb-4 text-sm text-text-muted">{status}</div>}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[14px] border border-white/[0.12] bg-white/[0.03] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold text-text-primary">{result.symbol}</div>
                {result.companyName && <div className="mt-0.5 text-base text-text-muted">{result.companyName}</div>}
                <div className="mt-1.5 text-xl">
                  <span className="font-semibold text-text-primary">{money(result.price)}</span>{" "}
                  {change && <span style={{ color: change.color }}>{change.text}</span>}
                </div>
                <div className="mt-1.5 text-sm text-text-muted">
                  {MARKET_STATE_LABELS[result.marketState] || result.marketState} &nbsp;Prev close:{" "}
                  {money(result.previousClose)}
                </div>
                <div className="mt-1 text-xs text-text-muted/80">As of {quoteTimeStr}</div>

                {result.extended && result.extended.price !== null && result.extended.price !== undefined && (
                  <div className="mt-2.5 text-sm">
                    <span className="text-text-muted">{result.extended.label}:</span>{" "}
                    <span className="font-semibold text-text-primary">{money(result.extended.price)}</span>{" "}
                    {extendedChange && <span style={{ color: extendedChange.color }}>{extendedChange.text}</span>}
                  </div>
                )}

                {/* Average Cost Owned: left-justified under the quote time,
                    same column as the price info above it. */}
                {userId && (
                  <div className="mt-4">
                    <AverageCostOwnedCard key={result.symbol} ticker={result.symbol} userId={userId} role={role} />
                  </div>
                )}
              </div>

              {/* Buy: its own column between Average Cost Owned and the
                  reserved/Score boxes, pinned to the bottom of the row
                  (lg:items-stretch above makes every column here match the
                  tallest one's height). */}
              <div className="flex shrink-0 flex-col justify-end">
                {userId && <BuyButton ticker={result.symbol} userId={userId} />}
              </div>

              <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row lg:flex-row">
                {/* Reserved for a future feature -- same neutral card style
                    as Sticky Monkey Score, just larger. */}
                <div className="min-h-[180px] w-full shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 sm:w-[220px]" />

                {result.stickyMonkeyScore !== null && result.stickyMonkeyScore !== undefined && (
                  <StickyMonkeyScoreCard result={result} />
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.pegRatio !== null && result.pegRatio !== undefined && result.pegRatio > 0 && (
              <Gauge value={result.pegRatio} config={PEG_GAUGE_CONFIG} />
            )}
            {result.debtToEquity !== null && result.debtToEquity !== undefined && (
              <Gauge value={result.debtToEquity} config={DEBT_EQUITY_GAUGE_CONFIG} />
            )}
            {result.returnOnEquity !== null && result.returnOnEquity !== undefined && (
              <Gauge value={result.returnOnEquity} config={ROE_GAUGE_CONFIG} />
            )}
            {result.returnOnAssets !== null && result.returnOnAssets !== undefined && (
              <Gauge value={result.returnOnAssets} config={ROA_GAUGE_CONFIG} />
            )}
            {result.currentRatio !== null && result.currentRatio !== undefined && (
              <Gauge value={result.currentRatio} config={CURRENT_RATIO_GAUGE_CONFIG} />
            )}
            {result.netProfitMargin !== null && result.netProfitMargin !== undefined && (
              <Gauge value={result.netProfitMargin} config={NET_PROFIT_MARGIN_GAUGE_CONFIG} />
            )}
            {result.priceToFreeCashFlow !== null &&
              result.priceToFreeCashFlow !== undefined &&
              result.priceToFreeCashFlow > 0 && (
                <Gauge value={result.priceToFreeCashFlow} config={PRICE_FCF_GAUGE_CONFIG} />
              )}
          </div>
        </div>
      )}
    </div>
  );
}

// Composite score (0-100) tallying the 7 gauges above -- see the
// `ticker-quote-lookup` edge function for the scoring methodology, industry
// comparison, and Graham Number intrinsic value estimate. All three numbers
// are computed server-side; this component only formats what it's given.
function StickyMonkeyScoreCard({ result }: { result: TickerQuoteResult }) {
  const score = result.stickyMonkeyScore;
  if (score === null || score === undefined) return null;
  const band = scoreBand(score);
  const industry = result.industry;
  const hasIndustryAvg =
    industry && industry.industryAvgScore !== null && industry.industryAvgScore !== undefined && industry.peerCount > 0;
  const delta = hasIndustryAvg ? score - (industry!.industryAvgScore as number) : null;

  return (
    <div className="w-full shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 sm:w-[260px]">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sticky Monkey Score</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-3xl font-bold" style={{ color: band.color }}>
          {score}
        </span>
        <span className="text-sm text-text-muted">/ 100</span>
      </div>
      <div className="mt-0.5 text-sm font-medium" style={{ color: band.color }}>
        {band.label}
      </div>

      <div className="mt-3 border-t border-white/[0.08] pt-3 text-sm">
        <div className="text-text-muted">
          {industry?.industryName ? industry.industryName : "Industry"} average
          {hasIndustryAvg ? ` (${industry!.peerCount} peers)` : ""}
        </div>
        {hasIndustryAvg ? (
          <div className="mt-0.5">
            <span className="font-semibold text-text-primary">{industry!.industryAvgScore}</span>
            <span className="text-text-muted"> / 100</span>{" "}
            <span style={{ color: delta !== null && delta >= 0 ? "#3ddc97" : "#ff5c5c" }}>
              {delta === 0
                ? `(even with ${result.symbol})`
                : delta !== null && delta > 0
                  ? `(${result.symbol} is ${delta} above)`
                  : `(${result.symbol} is ${Math.abs(delta ?? 0)} below)`}
            </span>
          </div>
        ) : (
          <div className="mt-0.5 text-text-muted/80">Not enough peer data available.</div>
        )}
      </div>

      <div className="mt-3 border-t border-white/[0.08] pt-3 text-sm">
        <div className="text-text-muted">Intrinsic value (Graham Number)</div>
        {result.intrinsicValue !== null && result.intrinsicValue !== undefined ? (
          <div className="mt-0.5 font-semibold text-text-primary">{money(result.intrinsicValue)} / share</div>
        ) : (
          <div className="mt-0.5 text-text-muted/80">{result.intrinsicValueNote || "Not available for this ticker."}</div>
        )}
      </div>

      <div className="mt-3 text-[11px] leading-snug text-text-muted/70">
        Tallies the 7 gauges below plus peer/book-value data. Informational only -- not investment advice.
      </div>
    </div>
  );
}

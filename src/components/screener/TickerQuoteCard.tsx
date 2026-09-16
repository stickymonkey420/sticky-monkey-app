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
import type { TickerQuoteResult } from "@/lib/screener/types";
import type { Role } from "@/lib/usersGroups/types";
import Gauge from "./Gauge";
import { AverageCostOwnedCard, BuyButton, SellPutButton } from "./TickerCostAndActions";

// The quote + Sticky Monkey Score + gauges card, extracted from
// TickerLookup's search-result rendering so it can be reused wherever a
// ticker's full detail needs to show up without the search box around it --
// e.g. TickerDetailModal, opened by clicking a ticker in ScreenerTable.
// TickerLookup itself now just fetches `result` (from typing a symbol) and
// renders this same card; nothing about the layout below changed from the
// original inline version.
export default function TickerQuoteCard({
  result,
  userId,
  role,
}: {
  result: TickerQuoteResult;
  userId: string | null;
  role: Role | null;
}) {
  let quoteTimeStr = "—";
  if (result.quoteTime) {
    try {
      quoteTimeStr = new Date(result.quoteTime).toLocaleString();
    } catch {
      quoteTimeStr = "—";
    }
  }

  const change = changeColored(result.change, result.changePct);
  const extendedChange = result.extended ? changeColored(result.extended.change, result.extended.changePct) : null;

  return (
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

          {/* Buy / Sell Option: their own column between Average Cost Owned
              and the reserved/Score boxes, pinned to the bottom of the row
              (lg:items-stretch above makes every column here match the
              tallest one's height). Both open a trade widget for any
              accepted match -- Buy for shares, Sell Option for a
              cash-secured put or covered call (toggle inside its modal) --
              see each button's own modal for what happens with no accepted
              match yet. */}
          <div className="flex shrink-0 flex-col justify-end gap-2">
            {userId && <BuyButton ticker={result.symbol} userId={userId} />}
            {userId && <SellPutButton ticker={result.symbol} userId={userId} />}
          </div>

          <div className="flex w-full flex-col items-stretch gap-4 sm:w-auto sm:flex-row lg:flex-row">
            {result.stickyMonkeyScore !== null && result.stickyMonkeyScore !== undefined && (
              <StickyMonkeyScoreCard result={result} />
            )}

            {/* Reserved for a future feature -- same neutral card style
                as Sticky Monkey Score, just larger. h-full so it
                stretches to match the row's full height instead of
                stopping at its own min-height. */}
            <div className="h-full min-h-[180px] w-full shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 sm:w-[220px]" />
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
    <div className="h-full w-full shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 sm:w-[260px]">
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

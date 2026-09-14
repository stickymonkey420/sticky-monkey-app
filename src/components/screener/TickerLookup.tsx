"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { changeColored, MARKET_STATE_LABELS, money } from "@/lib/screener/calc";
import { DEBT_EQUITY_GAUGE_CONFIG, PEG_GAUGE_CONFIG, ROE_GAUGE_CONFIG } from "@/lib/screener/gauge";
import { fetchTickerQuote } from "@/lib/screener/queries";
import type { TickerQuoteResult } from "@/lib/screener/types";
import Gauge, { GaugeUnavailable } from "./Gauge";

// Port of the live script's ticker-search widget: a single input + button
// hitting the `ticker-quote-lookup` edge function, rendering a price card
// plus the two Peter Lynch gauges. Ported 1:1 down to the 4-column grid
// (ticker card spans columns 1-2, gauges stack in column 2).
export default function TickerLookup() {
  const [symbol, setSymbol] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<TickerQuoteResult | null>(null);

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
        Live quote plus Peter Lynch-style PEG and Debt/Equity valuation gauges, and Return on Equity, for any ticker.
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[14px] border border-white/[0.12] bg-white/[0.03] p-5 sm:col-span-2">
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
          </div>

          <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-2">
            {result.pegRatio !== null && result.pegRatio !== undefined && result.pegRatio > 0 ? (
              <Gauge value={result.pegRatio} config={PEG_GAUGE_CONFIG} />
            ) : (
              <GaugeUnavailable label="PEG ratio" />
            )}
            {result.debtToEquity !== null && result.debtToEquity !== undefined ? (
              <Gauge value={result.debtToEquity} config={DEBT_EQUITY_GAUGE_CONFIG} />
            ) : (
              <GaugeUnavailable label="Debt-to-Equity ratio" />
            )}
            {result.returnOnEquity !== null && result.returnOnEquity !== undefined ? (
              <Gauge value={result.returnOnEquity} config={ROE_GAUGE_CONFIG} />
            ) : (
              <GaugeUnavailable label="Return on Equity" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

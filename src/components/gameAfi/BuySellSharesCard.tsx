"use client";

import { useState } from "react";
import { money } from "@/lib/options/queries";
import type { ExecuteTradeResult, PaperHolding } from "@/lib/gameAfi/paperTypes";

// Compact Buy/Sell Shares card -- sits to the left of "Sell a Contract" in
// the wheel section so a member can pick up the shares a covered call
// needs (or unload shares a put just assigned) without leaving this panel
// for the full shares-mode widget further up the page. Deliberately small:
// just ticker + qty + Buy/Sell, plus how many of that ticker are already
// owned in this same account (Sell is disabled at zero). Same account/
// holdings this match's shares-mode section already uses -- selling here
// updates the exact same paper_trades history, just from a second, smaller
// entry point.
export default function BuySellSharesCard({
  loading,
  holdings,
  trade,
}: {
  loading: boolean;
  holdings: PaperHolding[];
  trade: (ticker: string, side: "buy" | "sell", shares: number) => Promise<ExecuteTradeResult>;
}) {
  const [tickerInput, setTickerInput] = useState("");
  const [sharesInput, setSharesInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const ticker = tickerInput.trim().toUpperCase();
  const owned = ticker ? (holdings.find((h) => h.ticker === ticker)?.shares ?? 0) : null;

  async function handleTrade(side: "buy" | "sell") {
    const shares = Number(sharesInput);
    if (!ticker) {
      setTradeMessage({ text: "Enter a ticker.", ok: false });
      return;
    }
    if (!(shares > 0)) {
      setTradeMessage({ text: "Enter a number of shares greater than zero.", ok: false });
      return;
    }
    setSubmitting(true);
    setTradeMessage(null);
    const result = await trade(ticker, side, shares);
    setSubmitting(false);
    setTradeMessage({ text: result.message, ok: result.ok });
    if (result.ok) setSharesInput("");
  }

  return (
    <div className="flex-1 rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Buy / Sell Shares</h3>
      <p className="mb-3 text-xs text-text-muted">
        Pick up shares for a covered call, or unload shares from an assigned put.
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          value={tickerInput}
          onChange={(e) => setTickerInput(e.target.value)}
          placeholder="Ticker"
          className="w-32 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm text-text-primary outline-none"
        />
        <input
          value={sharesInput}
          onChange={(e) => setSharesInput(e.target.value)}
          placeholder="Shares"
          type="number"
          min="0"
          step="any"
          className="w-20 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm text-text-primary outline-none"
        />
      </div>

      {ticker && !loading && (
        <p className="mt-2 text-xs text-text-muted">
          {owned && owned > 0 ? (
            <>
              You own <span className="font-semibold text-text-primary">{owned}</span> share
              {owned === 1 ? "" : "s"} of {ticker}.
            </>
          ) : (
            <>No {ticker} shares owned in this account yet.</>
          )}
        </p>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          disabled={submitting || loading}
          onClick={() => handleTrade("buy")}
          className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
        >
          Buy
        </button>
        <button
          type="button"
          disabled={submitting || loading || !owned}
          onClick={() => handleTrade("sell")}
          className="rounded-md bg-[#ff5c7a] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
        >
          Sell
        </button>
      </div>

      {tradeMessage && (
        <p className={`mt-3 text-sm ${tradeMessage.ok ? "text-[#3ddc97]" : "text-[#ff5c7a]"}`}>{tradeMessage.text}</p>
      )}

      {!loading && ticker && owned !== null && owned > 0 && (
        <p className="mt-1 text-[11px] text-text-muted/70">
          Market value at current price: {money((holdings.find((h) => h.ticker === ticker)?.marketValue ?? 0) || 0)}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { money } from "@/lib/options/queries";
import type { ExecuteTradeResult, PaperAccount, PaperHolding } from "@/lib/gameAfi/paperTypes";
import PaperHoldingsTable from "./PaperHoldingsTable";

// The tiles + "Place a Trade" form + "Holdings" table portion of the Monkey
// Monkey (paper trading) account -- purely presentational, driven entirely
// by props from usePaperTradingAccount(). Extracted out of PaperTradingPanel
// so the exact same widget can be reused inside the "Buy" modal opened from
// a Stock Screener ticker card (see components/screener/BuyPaperTradeModal.tsx),
// without a second independent data-fetch living inside a shared component.
export default function PaperTradeWidget({
  loading,
  account,
  holdings,
  trade,
  initialTicker,
}: {
  loading: boolean;
  account: PaperAccount | null;
  holdings: PaperHolding[];
  trade: (ticker: string, side: "buy" | "sell", shares: number) => Promise<ExecuteTradeResult>;
  initialTicker?: string;
}) {
  const [tickerInput, setTickerInput] = useState(initialTicker ?? "");
  const [sharesInput, setSharesInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // initialTicker is only read as the useState above's lazy initial value --
  // BuyPaperTradeModal is unmounted/remounted (not kept alive and re-prop'd)
  // each time it's reopened for a different ticker, so a fresh mount is all
  // that's needed to pick up a new one; no effect required.

  async function handleTrade(side: "buy" | "sell") {
    const ticker = tickerInput.trim().toUpperCase();
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

  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        Loading paper trading account…
      </div>
    );
  }

  const holdingsValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
  const totalValue = (account?.cashBalance ?? 0) + holdingsValue;
  const totalReturn = totalValue - (account?.startingBalance ?? 10000);
  const totalReturnPct = account?.startingBalance ? (totalReturn / account.startingBalance) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Cash", value: money(account?.cashBalance ?? 0) },
          { label: "Holdings Value", value: money(holdingsValue) },
          { label: "Portfolio Value", value: money(totalValue) },
          {
            label: "Total Return",
            value: `${totalReturn >= 0 ? "+" : ""}${money(totalReturn)} (${totalReturn >= 0 ? "+" : ""}${totalReturnPct.toFixed(2)}%)`,
            color: totalReturn >= 0 ? "#3ddc97" : "#ff5c7a",
          },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-card-border bg-card-bg p-4">
            <div className="text-xs font-medium uppercase text-text-muted">{tile.label}</div>
            <div className="mt-1 text-lg font-semibold" style={{ color: tile.color ?? undefined }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Place a Trade</h3>
        <p className="mb-3 text-xs text-text-muted">
          Priced at the current tracked price for tickers in the Stock Screener universe (updated every 10 minutes).
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Ticker (e.g. AAPL)"
            className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={sharesInput}
            onChange={(e) => setSharesInput(e.target.value)}
            placeholder="Shares"
            type="number"
            min="0"
            step="any"
            className="w-28 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleTrade("buy")}
            className="rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            Buy
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleTrade("sell")}
            className="rounded-md bg-[#ff5c7a] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            Sell
          </button>
        </div>
        {tradeMessage && (
          <p className={`mt-3 text-sm ${tradeMessage.ok ? "text-[#f5d020]" : "text-[#ff5c7a]"}`}>{tradeMessage.text}</p>
        )}
      </div>

      <PaperHoldingsTable holdings={holdings} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { money } from "@/lib/options/queries";
import { computeLockedCollateral, computeTotalPremium } from "@/lib/gameAfi/contractQueries";
import type { PaperAccount } from "@/lib/gameAfi/paperTypes";
import type { PaperContractTrade, SellContractResult } from "@/lib/gameAfi/contractTypes";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The tiles + "Sell a Cash-Secured Put" form + "Open Contracts" table for
// the wheel/"Sell Contracts" mode -- purely presentational, driven entirely
// by props from useContractTradingAccount(), same split as PaperTradeWidget
// (the shares-mode equivalent this was modeled on) so it can be reused both
// inline on the Overview page and inside SellContractModal's popup.
export default function SellContractWidget({
  loading,
  account,
  trades,
  sell,
  initialTicker,
}: {
  loading: boolean;
  account: PaperAccount | null;
  trades: PaperContractTrade[];
  sell: (ticker: string, strike: number, contracts: number, expDate: string) => Promise<SellContractResult>;
  initialTicker?: string;
}) {
  const [tickerInput, setTickerInput] = useState(initialTicker ?? "");
  const [strikeInput, setStrikeInput] = useState("");
  const [contractsInput, setContractsInput] = useState("1");
  const [expInput, setExpInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSell() {
    const ticker = tickerInput.trim().toUpperCase();
    const strike = Number(strikeInput);
    const contracts = Number(contractsInput);
    if (!ticker) {
      setTradeMessage({ text: "Enter a ticker.", ok: false });
      return;
    }
    if (!(strike > 0)) {
      setTradeMessage({ text: "Enter a strike price greater than zero.", ok: false });
      return;
    }
    if (!(contracts > 0)) {
      setTradeMessage({ text: "Enter a number of contracts greater than zero.", ok: false });
      return;
    }
    if (!expInput) {
      setTradeMessage({ text: "Pick an expiration date.", ok: false });
      return;
    }
    setSubmitting(true);
    setTradeMessage(null);
    const result = await sell(ticker, strike, contracts, expInput);
    setSubmitting(false);
    setTradeMessage({ text: result.message, ok: result.ok });
    if (result.ok) {
      setStrikeInput("");
      setContractsInput("1");
      setExpInput("");
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        Loading contract trading account…
      </div>
    );
  }

  const lockedCollateral = computeLockedCollateral(trades);
  const totalPremium = computeTotalPremium(trades);
  const availableCash = Math.max((account?.cashBalance ?? 0) - lockedCollateral, 0);
  const today = todayIso();
  const openTrades = trades.filter((t) => t.exp_date >= today);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Cash", value: money(account?.cashBalance ?? 0) },
          { label: "Collateral Locked", value: money(lockedCollateral) },
          { label: "Available Cash", value: money(availableCash) },
          { label: "Total Premium Collected", value: money(totalPremium), color: "#3ddc97" },
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
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Sell a Cash-Secured Put</h3>
        <p className="mb-3 text-xs text-text-muted">
          Simulated premium (this app has no real options-data feed -- see the estimate note below), collateral
          locked from your paper cash until expiration. No shares are ever bought here, even if a real put like this
          would be assigned -- this mode tracks premium collected only.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Ticker (e.g. AAPL)"
            className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={strikeInput}
            onChange={(e) => setStrikeInput(e.target.value)}
            placeholder="Strike"
            type="number"
            min="0"
            step="any"
            className="w-28 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={contractsInput}
            onChange={(e) => setContractsInput(e.target.value)}
            placeholder="Contracts"
            type="number"
            min="1"
            step="1"
            className="w-28 rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          />
          <input
            value={expInput}
            onChange={(e) => setExpInput(e.target.value)}
            type="date"
            min={today}
            className="rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none [color-scheme:dark]"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={handleSell}
            className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
          >
            Sell Put
          </button>
        </div>
        {tradeMessage && (
          <p className={`mt-3 text-sm ${tradeMessage.ok ? "text-[#3ddc97]" : "text-[#ff5c7a]"}`}>{tradeMessage.text}</p>
        )}
      </div>

      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Open Contracts</h3>
        {openTrades.length === 0 ? (
          <div className="text-sm text-text-muted">No open contracts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="pb-2 pr-3 font-semibold">Ticker</th>
                  <th className="pb-2 pr-3 font-semibold">Strike</th>
                  <th className="pb-2 pr-3 font-semibold">Contracts</th>
                  <th className="pb-2 pr-3 font-semibold">Premium</th>
                  <th className="pb-2 font-semibold">Expires</th>
                </tr>
              </thead>
              <tbody>
                {openTrades.map((t) => (
                  <tr key={t.id} className="border-t border-white/[0.06]">
                    <td className="py-2 pr-3 font-medium text-text-primary">{t.ticker}</td>
                    <td className="py-2 pr-3 text-text-primary">{money(t.strike)}</td>
                    <td className="py-2 pr-3 text-text-primary">{t.contracts}</td>
                    <td className="py-2 pr-3" style={{ color: "#3ddc97" }}>
                      {money(t.premium)}
                    </td>
                    <td className="py-2 text-text-muted">{t.exp_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

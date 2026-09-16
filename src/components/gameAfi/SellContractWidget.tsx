"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysToExpiration, money } from "@/lib/options/queries";
import { computeLockedCollateral, computeTotalPremium, fetchTickerPrice } from "@/lib/gameAfi/contractQueries";
import { estimateContractPremium } from "@/lib/gameAfi/premiumEstimate";
import type { ExecuteTradeResult, PaperAccount, PaperHolding } from "@/lib/gameAfi/paperTypes";
import type { ContractType, PaperContractTrade, SellContractResult } from "@/lib/gameAfi/contractTypes";
import BuySellSharesCard from "./BuySellSharesCard";
import PreviewStat from "./PreviewStat";

// Every Friday from tomorrow through ~16 weeks out -- expiration is
// restricted to Fridays only (see the paper_contract_trades_exp_friday
// check constraint and game_afi_paper_sell_contract's own validation), and a
// native <input type="date"> can't restrict to one weekday, so this is a
// plain <select> of the actual candidate dates instead.
function upcomingFridays(count = 16): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1); // start looking from tomorrow
  while (out.length < count) {
    if (d.getDay() === 5) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Whole-dollar formatting for the live preview line -- unlike money()
// (used everywhere else in this widget for actual trade amounts), the
// preview is a rough estimate, so cents just add noise.
function moneyNoCents(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function outcomeLabel(t: PaperContractTrade): { text: string; color: string } {
  if (t.status === "assigned") {
    return t.contract_type === "put"
      ? { text: "Assigned -- shares bought at strike", color: "#ff9d4d" }
      : { text: "Assigned -- shares sold at strike", color: "#ff9d4d" };
  }
  if (t.status === "expired") return { text: "Expired worthless -- premium kept", color: "#3ddc97" };
  return { text: "Open", color: "#4f8cff" };
}

// The tiles + "Sell a Contract" form (put or call) + open/settled contract
// tables for the wheel mode -- purely presentational, driven entirely by
// props from useContractTradingAccount(). Available on every match
// alongside Buy/Sell Shares now (not a mutually-exclusive strategy), so this
// renders as one panel among several rather than the whole page.
export default function SellContractWidget({
  loading,
  account,
  trades,
  sell,
  initialTicker,
  sharesLoading = true,
  sharesHoldings = [],
  sharesTrade,
}: {
  loading: boolean;
  account: PaperAccount | null;
  trades: PaperContractTrade[];
  sell: (
    ticker: string,
    strike: number,
    contracts: number,
    expDate: string,
    contractType?: ContractType
  ) => Promise<SellContractResult>;
  initialTicker?: string;
  // Buy/Sell Shares card, rendered to the left of Sell a Contract -- optional
  // since it needs the shares-mode account wired up by the caller (see
  // usePaperTradingAccount); when omitted the shares card just doesn't
  // render rather than erroring.
  sharesLoading?: boolean;
  sharesHoldings?: PaperHolding[];
  sharesTrade?: (ticker: string, side: "buy" | "sell", shares: number) => Promise<ExecuteTradeResult>;
}) {
  const [contractType, setContractType] = useState<ContractType>("put");
  const [tickerInput, setTickerInput] = useState(initialTicker ?? "");
  const [strikeInput, setStrikeInput] = useState("");
  const [contractsInput, setContractsInput] = useState("1");
  const [expInput, setExpInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [tickerPrice, setTickerPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  const fridayOptions = useMemo(() => upcomingFridays(), []);

  // Live current price for whatever's typed in the ticker field, debounced
  // so it doesn't fire a lookup on every keystroke -- drives the premium
  // preview below the form so a member can see roughly what a sale would
  // pay before they hit Sell, instead of only finding out from the result
  // message afterward.
  useEffect(() => {
    const ticker = tickerInput.trim().toUpperCase();
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (!ticker) {
          if (!cancelled) setTickerPrice(null);
          return;
        }
        if (!cancelled) setPriceLoading(true);
        const supabase = createClient();
        const price = await fetchTickerPrice(supabase, ticker);
        if (!cancelled) {
          setTickerPrice(price);
          setPriceLoading(false);
        }
      },
      ticker ? 350 : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tickerInput]);

  const previewPremium = useMemo(
    () =>
      estimateContractPremium(
        tickerPrice,
        Number(strikeInput),
        Number(contractsInput) || 1,
        expInput,
        contractType
      ),
    [tickerPrice, strikeInput, contractsInput, expInput, contractType]
  );

  // Put collateral is a dollar amount (strike * contracts * 100, locked from
  // paper cash -- see computeLockedCollateral); a covered call locks shares
  // instead, so its "collateral" is a share count, not a dollar figure.
  const strikeNum = Number(strikeInput);
  const contractsNum = Number(contractsInput) || 1;
  const previewCollateral =
    strikeNum > 0
      ? contractType === "put"
        ? { kind: "cash" as const, amount: strikeNum * contractsNum * 100 }
        : { kind: "shares" as const, amount: contractsNum * 100 }
      : null;

  // Return on capital: premium collected divided by whatever's actually
  // tied up to make the sale -- the cash collateral for a put, or the
  // market value of the shares a call ties up (there's no cash lock for a
  // call, so its "capital" is those shares at the current price instead).
  const capitalBasis =
    previewCollateral === null
      ? null
      : previewCollateral.kind === "cash"
        ? previewCollateral.amount
        : tickerPrice !== null
          ? previewCollateral.amount * tickerPrice
          : null;
  const returnOnCapitalPct =
    previewPremium !== null && capitalBasis !== null && capitalBasis > 0
      ? (previewPremium / capitalBasis) * 100
      : null;
  const daysToExp = expInput ? daysToExpiration(expInput) : null;

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
      setTradeMessage({ text: "Pick a Friday expiration.", ok: false });
      return;
    }
    setSubmitting(true);
    setTradeMessage(null);
    const result = await sell(ticker, strike, contracts, expInput, contractType);
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
  const openTrades = trades.filter((t) => t.status === "open");
  const settledTrades = trades.filter((t) => t.status !== "open");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Cash", value: money(account?.cashBalance ?? 0) },
          { label: "Put Collateral Locked", value: money(lockedCollateral) },
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

      {/* Buy/Sell Shares sits to the left of the (now half-width) Sell a
          Contract card -- a covered call needs shares on hand, and an
          assigned put just handed you some, so both actions live side by
          side here instead of sending a member back up to the shares
          section for either one. No items-start override here (default is
          stretch) so both cards always match height -- whichever one has
          more content (the preview box appearing, a trade message, etc.)
          sets it, and the shorter card's own content still sits at its
          natural top position with the slack landing below it rather than
          between its fields and its buttons. */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {sharesTrade && (
          <BuySellSharesCard loading={sharesLoading} holdings={sharesHoldings} trade={sharesTrade} />
        )}

        <div className="flex-1 rounded-2xl border border-card-border bg-card-bg p-5">
          <h3 className="mb-1 text-sm font-semibold text-text-primary">Sell a Contract</h3>
          <p className="mb-3 text-xs text-text-muted">
            Simulated premium, Friday expirations only, with real assignment decided at Friday&apos;s close.
          </p>
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => setContractType("put")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                contractType === "put"
                  ? "bg-white/10 text-text-primary"
                  : "bg-white/5 text-text-muted hover:bg-white/10"
              }`}
            >
              Sell Cash-Secured Put
            </button>
            <button
              type="button"
              onClick={() => setContractType("call")}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                contractType === "call"
                  ? "bg-white/10 text-text-primary"
                  : "bg-white/5 text-text-muted hover:bg-white/10"
              }`}
            >
              Sell Covered Call
            </button>
          </div>
          {/* Ticker now absorbs whatever width Strike/Qty/Exp don't need
              (flex-1, was a fixed w-32) -- that naturally packs those three
              fields against the row's right edge, lined up with the Sell
              button underneath instead of trailing off after the ticker. */}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Ticker"
              className="min-w-[80px] flex-1 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm text-text-primary outline-none"
            />
            <input
              value={strikeInput}
              onChange={(e) => setStrikeInput(e.target.value)}
              placeholder="Strike"
              type="number"
              min="0"
              step="any"
              className="w-20 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm text-text-primary outline-none"
            />
            <input
              value={contractsInput}
              onChange={(e) => setContractsInput(e.target.value)}
              placeholder="Qty"
              type="number"
              min="1"
              step="1"
              className="w-14 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm text-text-primary outline-none"
            />
            <select
              value={expInput}
              onChange={(e) => setExpInput(e.target.value)}
              className="w-32 min-w-0 rounded-md border border-card-border bg-[#0f131c] px-2 py-2 text-sm text-text-primary outline-none [color-scheme:dark]"
            >
              <option value="">Exp (Fri)</option>
              {fridayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={submitting}
              onClick={handleSell}
              className="rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-50"
            >
              {contractType === "put" ? "Sell Put" : "Sell Call"}
            </button>
          </div>

          {tickerInput.trim() && (
            <div className="mt-3 min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3">
              {priceLoading && tickerPrice === null ? (
                <span className="text-sm text-text-muted">Looking up {tickerInput.trim().toUpperCase()}…</span>
              ) : tickerPrice === null ? (
                <span className="text-sm text-text-muted">
                  {tickerInput.trim().toUpperCase()} isn&apos;t in the tracked stock universe.
                </span>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                  <PreviewStat
                    label={`${tickerInput.trim().toUpperCase()} Price`}
                    value={moneyNoCents(tickerPrice)}
                    color="#f5d020"
                  />
                  {previewPremium !== null && (
                    <PreviewStat
                      label="Est. Premium"
                      value={moneyNoCents(previewPremium)}
                      color="#3ddc97"
                      sub={`${contractsNum} contract${contractsNum === 1 ? "" : "s"}`}
                    />
                  )}
                  {previewCollateral !== null && (
                    <PreviewStat
                      label={previewCollateral.kind === "cash" ? "Collateral Needed" : "Shares Needed"}
                      value={
                        previewCollateral.kind === "cash"
                          ? moneyNoCents(previewCollateral.amount)
                          : `${previewCollateral.amount} sh`
                      }
                      color="#ff9d4d"
                    />
                  )}
                  {returnOnCapitalPct !== null && (
                    <PreviewStat
                      label="Return on Capital"
                      value={`${returnOnCapitalPct.toFixed(1)}%`}
                      color="#3ddc97"
                    />
                  )}
                  {daysToExp !== null && daysToExp > 0 && (
                    <PreviewStat label="Days to Exp" value={`${daysToExp}`} />
                  )}
                </div>
              )}
            </div>
          )}

          {tradeMessage && (
            <p className={`mt-3 text-sm ${tradeMessage.ok ? "text-[#3ddc97]" : "text-[#ff5c7a]"}`}>
              {tradeMessage.text}
            </p>
          )}
        </div>
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
                  <th className="pb-2 pr-3 font-semibold">Type</th>
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
                    <td className="py-2 pr-3 text-text-primary">{t.contract_type === "put" ? "Put" : "Call"}</td>
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

      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-1 text-sm font-semibold text-text-primary">Settled Contracts</h3>
        <p className="mb-3 text-xs text-text-muted">
          Every contract past its Friday expiration -- premium collected, strike, and the actual closing price the
          assignment decision was made against.
        </p>
        {settledTrades.length === 0 ? (
          <div className="text-sm text-text-muted">No settled contracts yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="pb-2 pr-3 font-semibold">Ticker</th>
                  <th className="pb-2 pr-3 font-semibold">Type</th>
                  <th className="pb-2 pr-3 font-semibold">Strike</th>
                  <th className="pb-2 pr-3 font-semibold">Premium</th>
                  <th className="pb-2 pr-3 font-semibold">Expired</th>
                  <th className="pb-2 pr-3 font-semibold">Close Price</th>
                  <th className="pb-2 font-semibold">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {settledTrades.map((t) => {
                  const outcome = outcomeLabel(t);
                  return (
                    <tr key={t.id} className="border-t border-white/[0.06]">
                      <td className="py-2 pr-3 font-medium text-text-primary">{t.ticker}</td>
                      <td className="py-2 pr-3 text-text-primary">{t.contract_type === "put" ? "Put" : "Call"}</td>
                      <td className="py-2 pr-3 text-text-primary">{money(t.strike)}</td>
                      <td className="py-2 pr-3" style={{ color: "#3ddc97" }}>
                        {money(t.premium)}
                      </td>
                      <td className="py-2 pr-3 text-text-muted">{t.exp_date}</td>
                      <td className="py-2 pr-3 text-text-primary">
                        {t.settlement_price !== null ? money(t.settlement_price) : "—"}
                      </td>
                      <td className="py-2" style={{ color: outcome.color }}>
                        {outcome.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

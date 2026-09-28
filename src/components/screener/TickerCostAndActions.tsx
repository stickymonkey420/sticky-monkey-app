"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/screener/calc";
import { computeAvgCost, fetchPaperTradesForTicker } from "@/lib/gameAfi/paperQueries";
import { fetchActualAvgCostForTicker, fetchActualLotsForTicker, type TickerAccountLot } from "@/lib/holdings/queries";
import type { Role } from "@/lib/usersGroups/types";
import BuyPaperTradeModal from "@/components/gameAfi/BuyPaperTradeModal";
import SellContractModal from "@/components/gameAfi/SellContractModal";

function isPaidTier(role: Role | null): boolean {
  return role === "paid" || role === "app_director";
}

// "Average Cost Owned" card, rendered under the quote-time line on a Ticker
// Lookup result card. Shows both the free Monkey Monkey paper account's avg
// cost (always) and the user's actual tracked holdings avg cost (paid tier
// only -- free tier has no real positions tracked in the app at all, so
// there's nothing there to show rather than an empty/misleading row).
// Styled the same neutral card look as Sticky Monkey Score
// (border-white/[0.12], bg-white/[0.04]) rather than a colored card.
//
// The caller (TickerLookup) renders this with `key={ticker}` so a new
// search cleanly resets `loadingCosts` to true via a fresh mount instead of
// an effect reaching back to flip it synchronously (which the
// react-hooks/set-state-in-effect rule flags as an anti-pattern), and
// passes userId/role down as props since it already fetches them once for
// both this card and the separate BuyButton below.
export function AverageCostOwnedCard({ ticker, userId, role }: { ticker: string; userId: string; role: Role | null }) {
  const [paper, setPaper] = useState<{ shares: number; avgCost: number } | null>(null);
  const [actual, setActual] = useState<{ shares: number; avgCost: number } | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const paidTier = isPaidTier(role);
      const [paperTrades, actualCost] = await Promise.all([
        fetchPaperTradesForTicker(supabase, userId, ticker),
        // Free tier can't track real holdings in the app at all -- skip the
        // query entirely instead of fetching then hiding the result.
        paidTier ? fetchActualAvgCostForTicker(supabase, userId, ticker) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setPaper(computeAvgCost(paperTrades));
      setActual(actualCost);
      setLoadingCosts(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, role, ticker]);

  return (
    <div className="w-full min-w-[220px] shrink-0 rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 sm:w-auto">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">Average Cost Owned</div>
      {loadingCosts ? (
        <div className="mt-2 text-sm text-text-muted">Loading…</div>
      ) : (
        <div className="mt-2.5 flex flex-col gap-2.5 text-sm">
          <div>
            <div className="text-xs text-text-muted">Monkey Monkey</div>
            {paper ? (
              <div className="font-semibold text-text-primary">
                {paper.shares} sh @ {money(paper.avgCost)}
              </div>
            ) : (
              <div className="text-text-muted/80">No position yet</div>
            )}
          </div>
          {isPaidTier(role) && (
            <div>
              <div className="text-xs text-text-muted">Actual</div>
              {actual ? (
                <div className="font-semibold text-text-primary">
                  {actual.shares} sh @ {money(actual.avgCost)}
                </div>
              ) : (
                <div className="text-text-muted/80">No holdings tracked</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Buy button, rendered as its own flex item (bottom-aligned against the
// row's tallest sibling -- see TickerLookup) between the Average Cost
// Owned card and the reserved/Sticky Monkey Score boxes. Opens the same
// Monkey Monkey (paper trading) widget Game-a-Fi's own page uses, in a
// modal, pre-filled with this ticker.
export function BuyButton({ ticker, userId }: { ticker: string; userId: string }) {
  const [buyOpen, setBuyOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setBuyOpen(true)}
        className="shrink-0 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]"
      >
        Buy
      </button>
      {buyOpen && <BuyPaperTradeModal userId={userId} ticker={ticker} onClose={() => setBuyOpen(false)} />}
    </>
  );
}

// "Sell Option" button, the "Sell Contracts" (wheel) mode's equivalent of
// BuyButton above -- opens SellContractModal instead, offering either a
// cash-secured put or a covered call (toggle inside the modal) against any
// accepted match. Shown alongside Buy regardless of whether the member has
// an accepted match yet; same "show the button, explain what's missing
// inside the modal" pattern BuyPaperTradeModal already uses for "no
// accepted match yet".
export function SellPutButton({ ticker, userId }: { ticker: string; userId: string }) {
  const [sellOpen, setSellOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setSellOpen(true)}
        className="shrink-0 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]"
      >
        Sell Option
      </button>
      {sellOpen && <SellContractModal userId={userId} ticker={ticker} onClose={() => setSellOpen(false)} />}
    </>
  );
}

// "Sell Calculator" -- fills the gap between the Average Cost Owned card and
// the Buy/Sell Option buttons on a Ticker Lookup result: an inputs box, then
// a results box stacked above the buttons (the buttons are passed in as
// children so they stay in their usual bottom-aligned spot). Shares and
// purchase price are hard-filled from the member's ACTUAL tracked holdings
// of this ticker (all accounts, share-weighted average cost -- same numbers
// as the "Actual" line in Average Cost Owned) and aren't editable; the only
// input is the sell price, defaulting to the current quote. No commissions
// or capital-gains tax (per your call), so break-even = average cost.
// Paid tier only, like the Actual line -- free tier just gets the buttons.
const ACCOUNT_ORDER = ["brokerage", "traditional", "roth", "sdira", "crypto", "alt", "metals", "realestate"];
const ACCOUNT_SHORT: Record<string, string> = {
  brokerage: "Taxable",
  traditional: "IRA Trad",
  roth: "IRA Roth",
  sdira: "SDIRA",
  crypto: "Crypto",
  alt: "Alternative",
  metals: "Metals",
  realestate: "Real Estate",
};

export function SellCalculator({
  ticker,
  userId,
  role,
  currentPrice,
  children,
}: {
  ticker: string;
  userId: string;
  role: Role | null;
  currentPrice: number | null;
  children: React.ReactNode;
}) {
  const [lots, setLots] = useState<TickerAccountLot[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const defaultSell = currentPrice != null && Number.isFinite(currentPrice) ? currentPrice.toFixed(2) : "";
  const [sellPrice, setSellPrice] = useState(defaultSell);
  const paid = isPaidTier(role);

  useEffect(() => {
    let cancelled = false;
    if (!paid) return;
    fetchActualLotsForTicker(createClient(), userId, ticker).then((rows) => {
      if (cancelled) return;
      rows.sort((a, b) => ACCOUNT_ORDER.indexOf(a.account) - ACCOUNT_ORDER.indexOf(b.account));
      setLots(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, paid, ticker]);

  const buttons = <div className="flex shrink-0 flex-col justify-end gap-2">{children}</div>;
  if (!paid) return buttons;

  // Default: every account that holds this ticker is checked; unchecking one
  // re-weights shares + purchase price from the remaining accounts.
  const picked = lots.filter((l) => !excluded.has(l.account));
  const pickedShares = picked.reduce((a, l) => a + l.shares, 0);
  const actual =
    pickedShares > 0
      ? { shares: pickedShares, avgCost: picked.reduce((a, l) => a + l.shares * l.avgCost, 0) / pickedShares }
      : null;
  const toggle = (acct: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(acct)) next.delete(acct);
      else next.add(acct);
      return next;
    });

  const sell = Number(sellPrice);
  const valid = !!actual && sellPrice.trim() !== "" && Number.isFinite(sell) && sell >= 0;
  const netBuy = actual ? actual.shares * actual.avgCost : 0;
  const netSell = valid ? actual!.shares * sell : 0;
  const pl = netSell - netBuy;
  const roi = netBuy > 0 ? (pl / netBuy) * 100 : 0;
  const plColor = pl > 0 ? "#3ddc97" : pl < 0 ? "#ff5c7a" : undefined;

  const box = "rounded-2xl border border-white/[0.12] bg-white/[0.04] p-3.5";
  const label = "mb-1 block text-[11px] font-medium text-text-muted";
  const readOnly = "rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-sm text-text-primary";

  const results: { k: string; v: string; strong?: boolean; color?: string }[] = actual
    ? [
        { k: "Net buy", v: money(netBuy) },
        { k: "Net sell", v: valid ? money(netSell) : "--" },
        { k: "Profit / Loss", v: valid ? `${pl < 0 ? "-" : ""}${money(Math.abs(pl))}` : "--", strong: true, color: plColor },
        { k: "Return (ROI)", v: valid ? `${roi >= 0 ? "+" : ""}${roi.toFixed(2)}%` : "--", strong: true, color: plColor },
        { k: "Break-even", v: money(actual.avgCost) },
      ]
    : [];

  return (
    <div className="flex w-full shrink-0 flex-col gap-4 sm:w-auto sm:flex-row">
      {/* Inputs */}
      <div className={`${box} w-full sm:w-[155px]`}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Sell Calculator</div>
        {loading ? (
          <div className="mt-2 text-sm text-text-muted">Loading…</div>
        ) : lots.length === 0 ? (
          <div className="mt-2 text-xs leading-snug text-text-muted/80">
            No actual {ticker} holdings tracked. Add them under Investments to calculate a sale.
          </div>
        ) : (
          <div className="mt-2.5 flex flex-col gap-2.5">
            <div>
              <span className={label}>Accounts</span>
              <div className="flex flex-col gap-1">
                {lots.map((l) => (
                  <label key={l.account} className="flex cursor-pointer items-center gap-2 text-xs text-text-primary">
                    <input
                      type="checkbox"
                      checked={!excluded.has(l.account)}
                      onChange={() => toggle(l.account)}
                      className="accent-[#f5d020]"
                    />
                    {ACCOUNT_SHORT[l.account] ?? l.account}
                  </label>
                ))}
              </div>
            </div>
            {!actual ? (
              <div className="text-xs leading-snug text-text-muted/80">Check at least one account.</div>
            ) : (
            <>
            <div>
              <span className={label}>Number of shares</span>
              <div className={readOnly}>{actual.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
            </div>
            <div>
              <span className={label}>Purchase price</span>
              <div className={readOnly}>{money(actual.avgCost)}</div>
            </div>
            <div>
              <label className={label} htmlFor={`sell-price-${ticker}`}>
                Sell price
              </label>
              <input
                id={`sell-price-${ticker}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder="0"
                className="w-full rounded-md border border-white/[0.12] bg-[#0d0f17] px-2.5 py-1.5 text-sm text-text-primary outline-none focus:border-[#f5d020]/60"
              />
              {defaultSell && sellPrice !== defaultSell && (
                <button
                  type="button"
                  onClick={() => setSellPrice(defaultSell)}
                  className="mt-1 text-[11px] font-semibold text-[#4f8cff] hover:underline"
                >
                  Reset to current
                </button>
              )}
            </div>
            </>
            )}
          </div>
        )}
      </div>

      {/* Results above the Buy / Sell Option buttons */}
      <div className="flex w-full shrink-0 flex-col justify-between gap-3 sm:w-[140px]">
        {actual && (
          <div className={`${box} flex flex-col gap-1.5`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Results</div>
            {results.map((r) => (
              <div key={r.k} className="leading-tight">
                <div className="text-[11px] text-text-muted">{r.k}</div>
                <div
                  className={`text-sm tabular-nums ${r.strong ? "font-bold" : "font-medium text-text-primary"}`}
                  style={r.color ? { color: r.color } : undefined}
                >
                  {r.v}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-auto flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}

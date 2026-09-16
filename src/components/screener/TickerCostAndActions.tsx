"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/screener/calc";
import { computeAvgCost, fetchPaperTradesForTicker } from "@/lib/gameAfi/paperQueries";
import { fetchActualAvgCostForTicker } from "@/lib/holdings/queries";
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
        className="shrink-0 rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c]"
      >
        Buy
      </button>
      {buyOpen && <BuyPaperTradeModal userId={userId} ticker={ticker} onClose={() => setBuyOpen(false)} />}
    </>
  );
}

// "Sell Put" button, the "Sell Contracts" (wheel) mode's equivalent of
// BuyButton above -- opens SellContractModal instead, which only offers
// matches whose strategy is 'contracts'. Shown alongside Buy regardless of
// whether the member has a contracts-mode match yet; same "show the
// button, explain what's missing inside the modal" pattern BuyPaperTradeModal
// already uses for "no accepted match yet".
export function SellPutButton({ ticker, userId }: { ticker: string; userId: string }) {
  const [sellOpen, setSellOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setSellOpen(true)}
        className="shrink-0 rounded-md bg-[#f5d020] px-4 py-2 text-sm font-semibold text-[#0f131c]"
      >
        Sell Put
      </button>
      {sellOpen && <SellContractModal userId={userId} ticker={ticker} onClose={() => setSellOpen(false)} />}
    </>
  );
}

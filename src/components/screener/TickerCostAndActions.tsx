"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/screener/calc";
import { computeAvgCost, fetchPaperTradesForTicker } from "@/lib/gameAfi/paperQueries";
import { fetchActualAvgCostForTicker } from "@/lib/holdings/queries";
import type { Role } from "@/lib/usersGroups/types";
import BuyPaperTradeModal from "@/components/gameAfi/BuyPaperTradeModal";

function isPaidTier(role: Role | null): boolean {
  return role === "paid" || role === "app_director";
}

// The "Average Cost Owned" card + Buy button rendered under the quote-time
// line on a Ticker Lookup result card. Average Cost Owned shows both the
// free Monkey Monkey paper account's avg cost (always) and the user's
// actual tracked holdings avg cost (paid tier only -- free tier has no
// real positions tracked in the app at all, so there's nothing there to
// show rather than an empty/misleading row). The Buy button sits to its
// right, bottom-aligned with the card, and opens the same paper-trading
// widget Game-a-Fi's own page uses, in a modal, pre-filled with this
// ticker. Styled the same neutral card look as Sticky Monkey Score
// (border-white/[0.12], bg-white/[0.04]) rather than a colored card.
//
// Split into an outer/inner pair so the user id + tier (stable for the
// component's whole lifetime) are fetched exactly once, while the per-
// ticker avg-cost lookup resets cleanly on every new search: the inner
// component is keyed by `ticker`, so a new search remounts it with a fresh
// `loadingCosts=true` instead of an effect reaching back to flip it (which
// is both unnecessary and something the react-hooks/set-state-in-effect
// rule flags as a synchronous setState-in-effect anti-pattern).
export default function TickerCostAndActions({ ticker }: { ticker: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
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
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // These boxes are all about the signed-in user's own positions, so there's
  // nothing useful to render before we know who that is.
  if (!userId) return null;

  return <TickerCostAndActionsForTicker key={ticker} ticker={ticker} userId={userId} role={role} />;
}

function TickerCostAndActionsForTicker({
  ticker,
  userId,
  role,
}: {
  ticker: string;
  userId: string;
  role: Role | null;
}) {
  const [paper, setPaper] = useState<{ shares: number; avgCost: number } | null>(null);
  const [actual, setActual] = useState<{ shares: number; avgCost: number } | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);

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
    <div className="flex flex-wrap items-end gap-3">
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

      <button
        type="button"
        onClick={() => setBuyOpen(true)}
        className="shrink-0 rounded-md bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c]"
      >
        Buy
      </button>

      {buyOpen && <BuyPaperTradeModal userId={userId} ticker={ticker} onClose={() => setBuyOpen(false)} />}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useContractTradingAccount } from "@/lib/gameAfi/useContractTrading";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";
import { formatMoney } from "@/lib/gameAfi/format";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import SellContractWidget from "./SellContractWidget";

// Popup opened by the "Sell Option" button in the Stock Screener ticker
// card's action box -- the "Sell Contracts" (wheel) mode's equivalent of
// BuyPaperTradeModal. Offers every accepted Trade Off match (same
// unfiltered list BuyPaperTradeModal uses) -- Buy/Sell Shares, CSPs, and
// covered calls are all available together on any match now, not a
// strategy chosen once at challenge creation. Same overlay pattern (click
// the backdrop to close).
export default function SellContractModal({
  userId,
  ticker,
  onClose,
}: {
  userId: string;
  ticker: string;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<ChallengeRow[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMatches() {
      const supabase = createClient();
      const rows = await fetchChallenges(supabase);
      if (cancelled) return;
      const accepted = rows.filter((c) => c.status === "accepted");
      setMatches(accepted);
      setSelectedChallengeId(accepted[0]?.id ?? null);
      setMatchesLoaded(true);
    }
    loadMatches();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasMatch = selectedChallengeId !== null;
  const { loading, account, trades, sell } = useContractTradingAccount(hasMatch ? userId : null, selectedChallengeId);
  // Backs the Buy/Sell Shares card SellContractWidget renders alongside
  // Sell a Contract -- same account this match's shares mode already uses.
  const {
    loading: sharesLoading,
    holdings: sharesHoldings,
    trade: sharesTrade,
  } = usePaperTradingAccount(hasMatch ? userId : null, selectedChallengeId);

  const activeMatch = matches.find((m) => m.id === selectedChallengeId);
  const title = activeMatch
    ? `vs @${activeMatch.other_username ?? activeMatch.other_name ?? "Member"} -- Sell ${ticker} Option`
    : `Sell ${ticker} Option`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>
        <p className="mb-4 text-xs text-text-muted">
          Practice selling cash-secured puts and covered calls with simulated money and simulated premium.
          Assignment is decided for real at Friday&apos;s closing price -- see the Settled Contracts table below.
        </p>

        {!matchesLoaded ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
            You need an accepted Trade Off match before you can trade here. Send or accept a challenge on the
            Standings tab first.
          </div>
        ) : (
          <>
            <div className="mb-5">
              <label className="mb-1.5 block text-xs text-text-muted">Trading Account</label>
              <select
                value={selectedChallengeId ?? ""}
                onChange={(e) => setSelectedChallengeId(e.target.value)}
                className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    vs @{m.other_username ?? m.other_name ?? "Member"} ({formatMoney(m.starting_balance)})
                  </option>
                ))}
              </select>
            </div>

            <SellContractWidget
              loading={loading}
              account={account}
              trades={trades}
              sell={sell}
              initialTicker={ticker}
              sharesLoading={sharesLoading}
              sharesHoldings={sharesHoldings}
              sharesTrade={sharesTrade}
            />
          </>
        )}
      </div>
    </div>
  );
}

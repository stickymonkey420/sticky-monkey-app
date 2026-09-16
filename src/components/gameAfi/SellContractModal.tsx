"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useContractTradingAccount } from "@/lib/gameAfi/useContractTrading";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";
import { formatMoney } from "@/lib/gameAfi/format";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import SellContractWidget from "./SellContractWidget";

// Popup opened by the "Sell Put" button in the Stock Screener ticker
// card's action box -- the "Sell Contracts" (wheel) mode's equivalent of
// BuyPaperTradeModal. Only offers matches whose strategy is 'contracts'
// (set once at challenge creation -- see ChallengeMemberForm's strategy
// toggle); a match set to Buy/Sell Shares never appears here, and vice
// versa for BuyPaperTradeModal. Same overlay pattern (click the backdrop
// to close).
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
      const accepted = rows.filter((c) => c.status === "accepted" && c.strategy === "contracts");
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

  const activeMatch = matches.find((m) => m.id === selectedChallengeId);
  const title = activeMatch
    ? `vs @${activeMatch.other_username ?? activeMatch.other_name ?? "Member"} -- Sell ${ticker} Put`
    : `Sell ${ticker} Put`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card-bg p-7 shadow-2xl">
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
          Practice selling cash-secured puts with simulated money and simulated premium -- no shares are ever bought,
          even if a put like this would be assigned in real life.
        </p>

        {!matchesLoaded ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
            You need an accepted Trade Off match set to &quot;Sell Contracts (Wheel)&quot; before you can trade here.
            Send a challenge with that strategy on the Trade Off tab first.
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

            <SellContractWidget loading={loading} account={account} trades={trades} sell={sell} initialTicker={ticker} />
          </>
        )}
      </div>
    </div>
  );
}

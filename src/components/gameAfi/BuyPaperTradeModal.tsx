"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";
import { formatMoney } from "@/lib/gameAfi/format";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import PaperTradeWidget from "./PaperTradeWidget";

const PRACTICE_VALUE = "practice";

// Popup opened by the "Buy" button in the Stock Screener ticker card's
// green action box. Trades happen in one of several accounts: the
// free-standing "Monkey Monkey" practice account (always available), or
// any Head to Head match this member is currently in (status 'accepted') --
// each match has its own isolated cash/holdings, seeded with that match's
// agreed starting capital, so a trade here never touches the wrong
// account. Follows the same overlay pattern as EntryFormModal/
// RollPositionModal (click the backdrop to close).
export default function BuyPaperTradeModal({
  userId,
  ticker,
  onClose,
}: {
  userId: string;
  ticker: string;
  onClose: () => void;
}) {
  const [matches, setMatches] = useState<ChallengeRow[]>([]);
  const [selected, setSelected] = useState<string>(PRACTICE_VALUE);
  const selectedChallengeId = selected === PRACTICE_VALUE ? null : selected;

  useEffect(() => {
    let cancelled = false;
    async function loadMatches() {
      const supabase = createClient();
      const rows = await fetchChallenges(supabase);
      if (cancelled) return;
      setMatches(rows.filter((c) => c.status === "accepted"));
    }
    loadMatches();
    return () => {
      cancelled = true;
    };
  }, []);

  const { loading, account, holdings, trade } = usePaperTradingAccount(userId, selectedChallengeId);

  const activeMatch = matches.find((m) => m.id === selectedChallengeId);
  const title = activeMatch
    ? `vs @${activeMatch.other_username ?? activeMatch.other_name ?? "Member"} -- Buy ${ticker}`
    : `Monkey Monkey -- Buy ${ticker}`;

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
          Practice trading with simulated money -- no real cash is ever at risk. Priced at the current tracked price
          for tickers in the Stock Screener universe (updated every 10 minutes).
        </p>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs text-text-muted">Trading Account</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-md border border-card-border bg-[#0f131c] px-3 py-2 text-sm text-text-primary outline-none"
          >
            <option value={PRACTICE_VALUE}>Monkey Monkey (Practice)</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                vs @{m.other_username ?? m.other_name ?? "Member"} ({formatMoney(m.starting_balance)})
              </option>
            ))}
          </select>
        </div>

        <PaperTradeWidget loading={loading} account={account} holdings={holdings} trade={trade} initialTicker={ticker} />
      </div>
    </div>
  );
}

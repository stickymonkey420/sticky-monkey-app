"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";
import { formatMoney } from "@/lib/gameAfi/format";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";
import PaperTradeWidget from "./PaperTradeWidget";

// Popup opened by the "Buy" button in the Stock Screener ticker card's
// green action box. Trades happen against one of this member's accepted
// Head to Head matches -- each with its own isolated cash/holdings, seeded
// with that match's agreed starting capital. The free-standing "Monkey
// Monkey" practice account is no longer offered here (per the user: "I
// don't think I need monkey monkey") -- its backend plumbing is untouched
// (see lib/gameAfi/paperQueries.ts/usePaperTrading.ts, both still take an
// optional challengeId), just not surfaced in this picker. Follows the
// same overlay pattern as EntryFormModal/RollPositionModal (click the
// backdrop to close).
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
  // Only wire the hook up to a real userId once there's an actual match to
  // trade against -- passing null here (rather than the real userId) makes
  // its effect a no-op, so this modal never provisions or touches a
  // practice account just by being opened.
  const { loading, account, holdings, trade } = usePaperTradingAccount(hasMatch ? userId : null, selectedChallengeId);

  const activeMatch = matches.find((m) => m.id === selectedChallengeId);
  const title = activeMatch
    ? `vs @${activeMatch.other_username ?? activeMatch.other_name ?? "Member"} -- Buy ${ticker}`
    : `Buy ${ticker}`;

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

        {!matchesLoaded ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : matches.length === 0 ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
            You need an accepted Head to Head match before you can trade. Send or accept a challenge on the Head to
            Head tab first.
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

            <PaperTradeWidget
              loading={loading}
              account={account}
              holdings={holdings}
              trade={trade}
              initialTicker={ticker}
            />
          </>
        )}
      </div>
    </div>
  );
}

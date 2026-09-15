"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PaperHoldingsTable from "@/components/gameAfi/PaperHoldingsTable";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { fetchChallenges } from "@/lib/gameAfi/challengeQueries";
import { formatMoney } from "@/lib/gameAfi/format";
import type { ChallengeRow } from "@/lib/gameAfi/challengeTypes";

// Nav: Game-a-Fi > Holdings (route flattened to /monkey-monkey-holdings,
// matching this app's convention of flat top-level paths for nav leaves --
// e.g. /invest-accounts, /closed-positions -- rather than nested folders;
// also sidesteps NavItem's isLeafActive() prefix matching, which would
// otherwise also highlight the sibling "Standings" link (/game-a-fi) any
// time this page (/game-a-fi/holdings) was active). Holdings are scoped per
// Head to Head match (each an isolated paper account seeded with its own
// agreed starting capital -- see the paper-account-scoping migration), same
// as BuyPaperTradeModal's account picker. The free-standing "Monkey Monkey"
// practice account is no longer surfaced anywhere in the UI (per the user:
// "I don't think I need monkey monkey"), so this page no longer defaults to
// it -- doing so always showed empty holdings once trading moved to
// match-scoped accounts. These are simulated shares only -- never real
// holdings (those live under Invest > Holdings, paid tier).
export default function GameAFiHoldingsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ChallengeRow[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setUserId(user?.id ?? null);

      const rows = user ? await fetchChallenges(supabase) : [];
      if (cancelled) return;
      const accepted = rows.filter((c) => c.status === "accepted");
      setMatches(accepted);
      setSelectedChallengeId(accepted[0]?.id ?? null);
      setMatchesLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasMatch = selectedChallengeId !== null;
  const { loading, holdings } = usePaperTradingAccount(hasMatch ? userId : null, selectedChallengeId);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Game-a-Fi -- Holdings</h1>
      </div>
      <p className="mb-6 text-sm text-text-muted">
        Your Head to Head paper trading holdings -- simulated shares only, priced off the Stock Screener universe.
        Not real holdings; nothing here is actually at risk.
      </p>

      {!matchesLoaded ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
          You need an accepted Head to Head match before you have any holdings to show. Send or accept a challenge on
          the Head to Head tab first.
        </div>
      ) : (
        <>
          <div className="mb-5 max-w-xs">
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

          {loading ? (
            <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
              Loading…
            </div>
          ) : (
            <PaperHoldingsTable holdings={holdings} />
          )}
        </>
      )}
    </>
  );
}

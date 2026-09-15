"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PaperHoldingsTable from "@/components/gameAfi/PaperHoldingsTable";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";

// Nav: Game-a-Fi > Holdings (route flattened to /monkey-monkey-holdings,
// matching this app's convention of flat top-level paths for nav leaves --
// e.g. /invest-accounts, /closed-positions -- rather than nested folders;
// also sidesteps NavItem's isLeafActive() prefix matching, which would
// otherwise also highlight the sibling "Standings" link (/game-a-fi) any
// time this page (/game-a-fi/holdings) was active). Just the Monkey Monkey
// (paper trading) Holdings table on its own page, for anyone who wants to
// check their paper positions without the tiles/trade form/leaderboards
// that live on the main Game-a-Fi page. These are simulated shares only --
// never real holdings (those live under Invest > Holdings, paid tier).
export default function GameAFiHoldingsPage() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) setUserId(user?.id ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { loading, holdings } = usePaperTradingAccount(userId);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Game-a-Fi -- Holdings</h1>
      </div>
      <p className="mb-6 text-sm text-text-muted">
        Your Monkey Monkey (paper trading) holdings -- simulated shares only, priced off the Stock Screener universe.
        Not real holdings; nothing here is actually at risk.
      </p>
      {loading ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : (
        <PaperHoldingsTable holdings={holdings} />
      )}
    </>
  );
}

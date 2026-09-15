"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PaperHoldingsTable from "@/components/gameAfi/PaperHoldingsTable";
import PortfolioDonutCard from "@/components/invest/PortfolioDonutCard";
import HeadToHeadCard from "@/components/gameAfi/HeadToHeadCard";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { fetchChallenges, fetchMatchSummary } from "@/lib/gameAfi/challengeQueries";
import { computeHoldings, fetchOpponentTrades } from "@/lib/gameAfi/paperQueries";
import { appendCash, groupHoldingsByTicker } from "@/lib/gameAfi/allocationCalc";
import { formatMoney } from "@/lib/gameAfi/format";
import type { ChallengeRow, MatchSummary } from "@/lib/gameAfi/challengeTypes";
import type { PaperHolding } from "@/lib/gameAfi/paperTypes";

// Nav: Game-O-Fi > Overview (route flattened to /game-a-fi-overview,
// matching this app's convention of flat top-level paths for nav leaves --
// e.g. /invest-accounts, /closed-positions -- rather than nested folders).
// Replaces the old standalone "Holdings" leaf (formerly
// app/(app)/monkey-monkey-holdings/page.tsx) per your call to merge Holdings
// into a single Overview: the same match-scoped holdings table (Head to
// Head paper trading -- see the paper-account-scoping migration) plus a
// per-ticker holdings donut (mirrors Invest's Portfolio Allocation donuts),
// titled with the signed-in member's own @handle, and on the right the
// OPPONENT's own holdings donut, titled with THEIR @handle -- swapped in per
// your call to replace Industry Concentration (still available as
// IndustryBarChart/groupHoldingsByIndustry, just not surfaced here). The
// opponent donut is backed by the same game_afi_match_opponent_trades RPC
// pattern as game_afi_match_summary: a head-to-head match is a 1:1
// agreement both sides accepted, so exposing the opponent's per-ticker
// positions (not just their totals) is fine here, scoped to just this one
// match. Both donuts append a "Cash" row at the bottom (see allocationCalc's
// appendCash) so the breakdown covers the whole account, not just the
// invested portion.
// These are simulated shares only -- never real holdings (those live under
// Invest > Holdings, paid tier).
export default function GameAFiOverviewPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ChallengeRow[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [oppHoldings, setOppHoldings] = useState<PaperHolding[]>([]);
  const [oppHoldingsLoading, setOppHoldingsLoading] = useState(true);

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

  // Opponent's holdings for the currently-selected match -- fetches their
  // raw trades via game_afi_match_opponent_trades, then reuses the exact
  // same computeHoldings() pipeline usePaperTradingAccount uses for the
  // caller's own trades, so both sides' donuts are built identically.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedChallengeId) {
        if (!cancelled) {
          setOppHoldings([]);
          setOppHoldingsLoading(false);
        }
        return;
      }
      setOppHoldingsLoading(true);
      const supabase = createClient();
      const trades = await fetchOpponentTrades(supabase, selectedChallengeId);
      const computed = await computeHoldings(supabase, trades);
      if (!cancelled) {
        setOppHoldings(computed);
        setOppHoldingsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChallengeId]);

  // Head to Head card -- both sides' totals for the currently-selected
  // match (see game_afi_match_summary). Independent of usePaperTradingAccount
  // since it also needs the OPPONENT's cash/holdings, which that hook never
  // fetches (it only ever reads the signed-in user's own account).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedChallengeId) {
        if (!cancelled) {
          setMatchSummary(null);
          setSummaryLoading(false);
        }
        return;
      }
      setSummaryLoading(true);
      const supabase = createClient();
      const summary = await fetchMatchSummary(supabase, selectedChallengeId);
      if (!cancelled) {
        setMatchSummary(summary);
        setSummaryLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChallengeId]);

  const allocation = useMemo(() => {
    const base = groupHoldingsByTicker(holdings);
    return matchSummary ? appendCash(base, matchSummary.me.cashBalance) : base;
  }, [holdings, matchSummary]);

  const opponentAllocation = useMemo(() => {
    const base = groupHoldingsByTicker(oppHoldings);
    return matchSummary ? appendCash(base, matchSummary.opponent.cashBalance) : base;
  }, [oppHoldings, matchSummary]);

  const myTitle = matchSummary ? `@${matchSummary.me.username ?? matchSummary.me.name ?? "Me"}` : "Allocation";

  const opponentTitle = matchSummary
    ? `@${matchSummary.opponent.username ?? matchSummary.opponent.name ?? "Opponent"}`
    : "Opponent Holdings";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Game-O-Fi -- Overview</h1>
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
          the Standings tab first.
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

          <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-4">
            <div className="md:col-span-1">
              <PortfolioDonutCard
                title={myTitle}
                slices={allocation.slices}
                total={allocation.total}
                loading={loading}
                emptyLabel="No open positions yet -- place your first trade to get started."
                formatValue={formatMoney}
              />
            </div>
            <div className="md:col-span-2">
              <HeadToHeadCard loading={summaryLoading} summary={matchSummary} holdings={holdings} />
            </div>
            <div className="md:col-span-1">
              <PortfolioDonutCard
                title={opponentTitle}
                slices={opponentAllocation.slices}
                total={opponentAllocation.total}
                loading={oppHoldingsLoading}
                emptyLabel="No open positions yet."
                formatValue={formatMoney}
              />
            </div>
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

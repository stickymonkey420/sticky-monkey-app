"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PortfolioDonutCard from "@/components/invest/PortfolioDonutCard";
import HeadToHeadCard from "@/components/gameAfi/HeadToHeadCard";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { fetchChallenges, fetchMatchSummary } from "@/lib/gameAfi/challengeQueries";
import { computeHoldings, fetchOpponentTrades } from "@/lib/gameAfi/paperQueries";
import { appendCash, applyColorOverrides, groupHoldingsByTicker } from "@/lib/gameAfi/allocationCalc";
import { formatMoney } from "@/lib/gameAfi/format";
import { fetchTickerColorOverrides, setTickerColorOverride } from "@/lib/gameAfi/tickerColors";
import type { ChallengeRow, MatchSummary } from "@/lib/gameAfi/challengeTypes";
import type { PaperHolding } from "@/lib/gameAfi/paperTypes";

// Condensed mirror of the Game-a-Fi Overview page's holdings + scoreboard
// row, per your call to surface it on the Dashboard too instead of making
// members navigate to Game-O-Fi to see it. Same three cards (Allocation,
// the Arena Jumbotron Head to Head scoreboard, opponent Holdings), same
// data pipeline (game_afi_match_summary / game_afi_match_opponent_trades,
// this member's own game_afi_ticker_colors overrides) -- just without the
// Overview page's match-picker dropdown or the full trades table below it,
// since this is a glance-and-go widget, not the dedicated page. Defaults to
// the same first accepted match the Overview page starts on; switching
// matches (if a member has more than one) still only happens on Overview
// itself. Hidden entirely (renders nothing) if there's no accepted match to
// show -- per the same "hide zero/not-applicable" rule as the rest of this
// Dashboard pass, this widget is either useful or absent, never an empty
// "you need a match" placeholder cluttering the Dashboard.
export default function GameAfiMirrorCard() {
  const [userId, setUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<ChallengeRow[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [oppHoldings, setOppHoldings] = useState<PaperHolding[]>([]);
  const [oppHoldingsLoading, setOppHoldingsLoading] = useState(true);
  const [colorOverrides, setColorOverrides] = useState<Map<string, string>>(new Map());

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
      setMatches(rows.filter((c) => c.status === "accepted"));
      setMatchesLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const challengeId = matches[0]?.id ?? null;
  const { loading, holdings } = usePaperTradingAccount(challengeId ? userId : null, challengeId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!challengeId) {
        if (!cancelled) {
          setOppHoldings([]);
          setOppHoldingsLoading(false);
        }
        return;
      }
      setOppHoldingsLoading(true);
      const supabase = createClient();
      const trades = await fetchOpponentTrades(supabase, challengeId);
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
  }, [challengeId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!challengeId) {
        if (!cancelled) {
          setMatchSummary(null);
          setSummaryLoading(false);
        }
        return;
      }
      setSummaryLoading(true);
      const supabase = createClient();
      const summary = await fetchMatchSummary(supabase, challengeId);
      if (!cancelled) {
        setMatchSummary(summary);
        setSummaryLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [challengeId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!userId) return;
      const supabase = createClient();
      const overrides = await fetchTickerColorOverrides(supabase, userId);
      if (!cancelled) setColorOverrides(overrides);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function handleColorChange(name: string, color: string) {
    setColorOverrides((prev) => {
      const next = new Map(prev);
      next.set(name, color);
      return next;
    });
    if (userId) {
      const supabase = createClient();
      void setTickerColorOverride(supabase, userId, name, color);
    }
  }

  const allocation = useMemo(() => {
    const base = groupHoldingsByTicker(holdings);
    const withCash = matchSummary ? appendCash(base, matchSummary.me.cashBalance) : base;
    return applyColorOverrides(withCash, colorOverrides);
  }, [holdings, matchSummary, colorOverrides]);

  const opponentAllocation = useMemo(() => {
    const base = groupHoldingsByTicker(oppHoldings);
    const withCash = matchSummary ? appendCash(base, matchSummary.opponent.cashBalance) : base;
    return applyColorOverrides(withCash, colorOverrides);
  }, [oppHoldings, matchSummary, colorOverrides]);

  const myTitle = matchSummary ? `@${matchSummary.me.username ?? matchSummary.me.name ?? "Me"}` : "Allocation";
  const opponentTitle = matchSummary
    ? `@${matchSummary.opponent.username ?? matchSummary.opponent.name ?? "Opponent"}`
    : "Opponent Holdings";

  if (matchesLoaded && matches.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">Game-O-Fi</h2>
        <Link href="/game-a-fi-overview" className="text-xs font-semibold text-[#4f8cff] hover:underline">
          View Game-O-Fi
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
        <div className="md:col-span-1">
          <PortfolioDonutCard
            title={myTitle}
            slices={allocation.slices}
            total={allocation.total}
            loading={loading}
            emptyLabel="No open positions yet."
            formatValue={formatMoney}
            onColorChange={handleColorChange}
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
            onColorChange={handleColorChange}
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import PaperHoldingsTable from "@/components/gameAfi/PaperHoldingsTable";
import PortfolioDonutCard from "@/components/invest/PortfolioDonutCard";
import HeadToHeadCard from "@/components/gameAfi/HeadToHeadCard";
import { usePaperTradingAccount } from "@/lib/gameAfi/usePaperTrading";
import { useContractTradingAccount } from "@/lib/gameAfi/useContractTrading";
import SellContractWidget from "@/components/gameAfi/SellContractWidget";
import { fetchChallenges, fetchMatchSummary } from "@/lib/gameAfi/challengeQueries";
import { computeHoldings, fetchOpponentTrades } from "@/lib/gameAfi/paperQueries";
import { appendCash, applyColorOverrides, groupHoldingsByTicker } from "@/lib/gameAfi/allocationCalc";
import { formatMoney } from "@/lib/gameAfi/format";
import { fetchTickerColorOverrides, setTickerColorOverride } from "@/lib/gameAfi/tickerColors";
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
// invested portion. Every legend swatch (on both donuts) is clickable --
// see PortfolioDonutCard's onColorChange -- opening the browser's native
// color picker to recolor that name; the choice is personal to the viewing
// member (game_afi_ticker_colors, tickerColors.ts) and applies to both
// donuts, so a ticker keeps one consistent color across the whole page.
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

  // Both hooks are always active for the currently selected match now --
  // Buy/Sell Shares, CSPs, and covered calls all coexist on every match, so
  // there's no more exclusive strategy branch to gate either one behind.
  // Each still no-ops (its effect never fires a fetch) when passed a null
  // userId, same guard usePaperTradingAccount's own callers already rely on
  // elsewhere (e.g. BuyPaperTradeModal).
  const { loading, holdings } = usePaperTradingAccount(hasMatch ? userId : null, selectedChallengeId);
  const contractAccount = useContractTradingAccount(hasMatch ? userId : null, selectedChallengeId);

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

  // This member's own per-name color overrides for the donut legends below
  // (see tickerColors.ts) -- loaded once userId is known, independent of
  // which match is selected, since a recolored ticker should stay that
  // color across every match, not just the one it was set on.
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

  // Applied to a swatch click on EITHER donut -- updates local state
  // immediately (so both donuts recolor together, since the same ticker can
  // appear on both sides) and persists in the background; a failed save
  // just means the override doesn't survive a reload, not a broken click.
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

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Game-O-Fi -- Overview</h1>
      </div>
      <p className="mb-6 text-sm text-text-muted">
        Your Trade Off paper trading holdings -- simulated shares only, priced off the Stock Screener universe.
        Not real holdings; nothing here is actually at risk.
      </p>

      {!matchesLoaded ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
          You need an accepted Trade Off match before you have any holdings to show. Send or accept a challenge on
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

          {/* Shares: allocation donuts, Head to Head/Trade Off summary card,
              and the holdings table -- unchanged from before the full-wheel
              expansion. */}
          <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-4">
            <div className="md:col-span-1">
              <PortfolioDonutCard
                title={myTitle}
                slices={allocation.slices}
                total={allocation.total}
                loading={loading}
                emptyLabel="No open positions yet -- place your first trade to get started."
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

          {loading ? (
            <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
              Loading…
            </div>
          ) : (
            <PaperHoldingsTable holdings={holdings} />
          )}

          {/* Contracts (wheel): CSPs and covered calls now coexist with
              shares on every match -- see the full-wheel-with-assignment
              migration -- so this renders below the shares section instead
              of replacing it. */}
          <div className="mt-6">
            <h2 className="mb-3 text-base font-semibold text-text-primary">Sell Contracts (Wheel)</h2>
            <SellContractWidget
              loading={contractAccount.loading}
              account={contractAccount.account}
              trades={contractAccount.trades}
              sell={contractAccount.sell}
            />
          </div>
        </>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeHoldings, ensurePaperAccount, executeTrade, fetchPaperTrades } from "./paperQueries";
import type { PaperAccount, PaperHolding, PaperTrade } from "./paperTypes";

// Shared data layer for a paper trading account/holdings (Game-a-Fi Phase
// 2), factored out of PaperTradingPanel so the same account + holdings +
// trade-execution logic can back both the full Game-a-Fi page and the
// compact "Buy" modal opened from a Stock Screener ticker card, without
// duplicating the fetch/refresh code between them.
//
// challengeId selects WHICH account: null (default) is the free-standing
// "Monkey Monkey" practice account; a specific challenge id is that
// ACCEPTED Head to Head match's own account, seeded with its agreed
// starting capital and never mixing holdings/cash with the practice
// account or another match. See lib/gameAfi/paperQueries.ts.
export function usePaperTradingAccount(userId: string | null, challengeId: string | null = null) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [holdings, setHoldings] = useState<PaperHolding[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const [acct, tradeRows] = await Promise.all([
      ensurePaperAccount(supabase, challengeId),
      fetchPaperTrades(supabase, userId, challengeId),
    ]);
    setAccount(acct);
    setTrades(tradeRows);
    setHoldings(await computeHoldings(supabase, tradeRows));
  }, [userId, challengeId]);

  useEffect(() => {
    // Mirrors the set-state-in-effect guard used elsewhere in this app
    // (see PaperTradingPanel/my-business's own note): no synchronous
    // setState when userId is absent, since callers already render a
    // signed-out fallback in that case instead of showing a stale loading
    // state.
    if (!userId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  const trade = useCallback(
    async (ticker: string, side: "buy" | "sell", shares: number) => {
      const supabase = createClient();
      const result = await executeTrade(supabase, ticker, side, shares, challengeId);
      if (result.ok) await refresh();
      return result;
    },
    [refresh, challengeId]
  );

  return { loading, account, trades, holdings, refresh, trade };
}

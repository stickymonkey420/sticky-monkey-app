"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensurePaperAccount } from "./paperQueries";
import { fetchContractTrades, sellContract } from "./contractQueries";
import type { PaperAccount } from "./paperTypes";
import type { ContractType, PaperContractTrade, SellContractResult } from "./contractTypes";

// Shared data layer for the "Sell Contracts" (wheel) mode's account +
// contract-trade history + sell action -- mirrors usePaperTrading.ts's
// shares-mode hook exactly, just against paper_contract_trades instead of
// paper_trades. Reuses the same paper_accounts row/RPC (ensurePaperAccount)
// as shares mode: cash balance is one shared pool per account, whichever
// strategy that account's match is set to.
export function useContractTradingAccount(userId: string | null, challengeId: string | null = null) {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<PaperAccount | null>(null);
  const [trades, setTrades] = useState<PaperContractTrade[]>([]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const [acct, tradeRows] = await Promise.all([
      ensurePaperAccount(supabase, challengeId),
      fetchContractTrades(supabase, userId, challengeId),
    ]);
    setAccount(acct);
    setTrades(tradeRows);
  }, [userId, challengeId]);

  useEffect(() => {
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

  const sell = useCallback(
    async (
      ticker: string,
      strike: number,
      contracts: number,
      expDate: string,
      contractType: ContractType = "put"
    ): Promise<SellContractResult> => {
      const supabase = createClient();
      const result = await sellContract(supabase, ticker, strike, contracts, expDate, challengeId, contractType);
      if (result.ok) await refresh();
      return result;
    },
    [refresh, challengeId]
  );

  return { loading, account, trades, refresh, sell };
}

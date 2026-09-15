"use client";

import { useEffect, useMemo, useState } from "react";
import WalletOverviewCards from "@/components/wallet/WalletOverviewCards";
import TopSpendingDonut from "@/components/wallet/TopSpendingDonut";
import DebitCreditChart from "@/components/wallet/DebitCreditChart";
import { createClient } from "@/lib/supabase/client";
import { fetchManualAccounts, fetchPlaidTransactions } from "@/lib/wallet/queries";
import { computeTopSpendingByAccount, computeWalletOverview } from "@/lib/wallet/calc";
import type { ManualAccount, PlaidTransaction } from "@/lib/wallet/types";

// Read-only port of the live Webflow "My Wallet" page (id
// 665f5b07319971d77a6e1313): balance/income/expense overview, a Top
// Spending by Account donut, and a Debit/Credit activity chart. This page
// has no write actions in the original either -- account balances are
// managed on the Accounts page and transactions arrive via a server-side
// Plaid sync this app doesn't touch (no INSERT policy exists on
// plaid_transactions for the client at all).
export default function WalletPage() {
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
  const [txs, setTxs] = useState<PlaidTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      if (!cancelled) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setAccounts([]);
          setTxs([]);
          setLoading(false);
        }
        return;
      }

      const [accountRows, txRows] = await Promise.all([
        fetchManualAccounts(supabase, user.id),
        fetchPlaidTransactions(supabase, user.id),
      ]);
      if (cancelled) return;
      setAccounts(accountRows);
      setTxs(txRows);
      setLoading(false);
    }

    load();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) load();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  const overview = useMemo(() => computeWalletOverview(accounts, txs), [accounts, txs]);
  const topSpending = useMemo(() => computeTopSpendingByAccount(txs, accounts), [txs, accounts]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">My Wallet</h1>
      </div>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-6 auto-rows-fr lg:grid-cols-2">
          <WalletOverviewCards overview={overview} loading={loading} />
          <TopSpendingDonut data={topSpending} loading={loading} />
        </div>
        <DebitCreditChart txs={txs} loading={loading} />
      </div>
    </>
  );
}

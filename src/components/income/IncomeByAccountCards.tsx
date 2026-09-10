"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computePremiumSummary, fetchPremiumSummaryRows, money } from "@/lib/options/queries";
import { EMPTY_PREMIUM_SUMMARY, type AccountTypeOption, type PremiumSummary } from "@/lib/options/types";

const STAT_CARDS: { key: keyof PremiumSummary; label: string; hint: string }[] = [
  { key: "total", label: "Collected This Month", hint: "Premium on trades entered this calendar month" },
  { key: "realized", label: "Realized / Closed", hint: "Locked-in premium on closed trades this year" },
  { key: "open", label: "Open Premium (Unrealized)", hint: "Premium collected on still-open positions" },
  { key: "capital", label: "Capital at Risk (CSP)", hint: "Cash on the hook for open cash-secured puts" },
];

function AccountCard({ userId, account }: { userId: string; account: AccountTypeOption }) {
  const [summary, setSummary] = useState<PremiumSummary>(EMPTY_PREMIUM_SUMMARY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      if (!cancelled) setLoading(true);
      const rows = await fetchPremiumSummaryRows(supabase, userId, account.id);
      if (cancelled) return;
      setSummary(computePremiumSummary(rows));
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
  }, [userId, account.id]);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{account.label}</h3>
      <div className="grid grid-cols-2 gap-3">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="rounded-xl bg-white/5 p-3.5" title={card.hint}>
            <div className="mb-1.5 text-[11px] font-medium text-text-muted">{card.label}</div>
            <div className="text-base font-semibold text-text-primary">
              {loading ? "…" : money(summary[card.key])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Port of the live Webflow "Income" page's "Premium Collected" section
// (page id 6a9532ef6720b273eadf12c3): unlike the Options page (one account
// selected via tabs), Income shows every wheel-eligible account's summary
// side by side at once. Reuses the exact same computePremiumSummary /
// fetchPremiumSummaryRows math as Options -- only the layout differs (a
// fixed 2x2 tile grid per account card instead of Options' 4-across grid,
// since these cards sit 2-3 to a row instead of full-width).
export default function IncomeByAccountCards({
  userId,
  accounts,
  loading,
}: {
  userId: string | null;
  accounts: AccountTypeOption[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        Loading accounts…
      </div>
    );
  }
  if (!userId || accounts.length === 0) {
    return (
      <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
        No wheel-eligible accounts set up yet.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {accounts.map((account) => (
        <AccountCard key={account.id} userId={userId} account={account} />
      ))}
    </div>
  );
}

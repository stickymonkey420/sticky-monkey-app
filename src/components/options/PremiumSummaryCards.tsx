"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computePremiumSummary, fetchPremiumSummaryRows, money } from "@/lib/options/queries";
import { EMPTY_PREMIUM_SUMMARY, type PremiumSummary } from "@/lib/options/types";

type PremiumSummaryCardsProps = {
  accountType: string | null;
  refreshKey?: number;
};

const STAT_CARDS: {
  key: keyof PremiumSummary;
  label: string;
  hint: string;
}[] = [
  { key: "total", label: "This Month", hint: "Premium on trades entered this calendar month" },
  { key: "realized", label: "Realized (YTD)", hint: "Locked-in premium on closed trades this year" },
  { key: "open", label: "Open (At Risk)", hint: "Premium collected on still-open positions" },
  { key: "capital", label: "Capital at Risk", hint: "Cash on the hook for open cash-secured puts" },
];

// Mirrors the "Premium Collected" summary row from the live Webflow Options
// page (`opt-prem-<account>-*` elements, loadPremiumSummary() in the ported
// script) -- same stat-card layout as Dashboard's IncomeCard.
export default function PremiumSummaryCards({ accountType, refreshKey = 0 }: PremiumSummaryCardsProps) {
  const [summary, setSummary] = useState<PremiumSummary>(EMPTY_PREMIUM_SUMMARY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      if (!accountType) {
        if (!cancelled) {
          setSummary(EMPTY_PREMIUM_SUMMARY);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const rows = await fetchPremiumSummaryRows(supabase, user.id, accountType);
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
  }, [accountType, refreshKey]);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Premium Collected</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className="rounded-xl bg-white/5 p-4" title={card.hint}>
            <div className="mb-2 text-xs font-medium text-text-muted">{card.label}</div>
            <div className="text-lg font-semibold text-text-primary">
              {loading ? "…" : money(summary[card.key])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

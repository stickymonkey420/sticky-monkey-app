"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchHoldings } from "@/lib/holdings/queries";
import { withDerived } from "@/lib/holdings/calc";
import { money } from "@/lib/options/queries";
import type { HoldingWithDerived } from "@/lib/holdings/types";

type HoldingsSummaryProps = {
  accountType: string | null;
  refreshKey?: number;
};

// Same stat-card layout as Options' PremiumSummaryCards -- position count,
// total market value, and total gain in dollars/percent across whatever
// holdings the parent has currently scoped (all accounts, or one via
// `?account=`).
export default function HoldingsSummary({ accountType, refreshKey = 0 }: HoldingsSummaryProps) {
  const [holdings, setHoldings] = useState<HoldingWithDerived[]>([]);
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
          setHoldings([]);
          setLoading(false);
        }
        return;
      }

      const rows = await fetchHoldings(supabase, user.id, accountType);
      if (cancelled) return;
      setHoldings(rows.map(withDerived));
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

  const positionCount = holdings.length;
  const totalValue = holdings.reduce((sum, h) => sum + h.mkt_value, 0);
  const totalCost = holdings.reduce((sum, h) => sum + h.cost_total, 0);
  const totalGainDollar = totalValue - totalCost;
  const totalGainPct = totalCost !== 0 ? (totalGainDollar / totalCost) * 100 : null;
  const gainColor = totalGainDollar >= 0 ? "#3ddc97" : "#ff5c7a";

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Holdings Summary</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-text-muted">Positions</div>
          <div className="text-lg font-semibold text-text-primary">{loading ? "…" : positionCount}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-text-muted">Total Value</div>
          <div className="text-lg font-semibold text-text-primary">{loading ? "…" : money(totalValue)}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-text-muted">Total Gain / Loss</div>
          <div className="text-lg font-semibold" style={{ color: loading ? undefined : gainColor }}>
            {loading ? "…" : `${totalGainDollar >= 0 ? "+" : "-"}${money(Math.abs(totalGainDollar))}`}
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-4">
          <div className="mb-2 text-xs font-medium text-text-muted">Gain / Loss %</div>
          <div className="text-lg font-semibold" style={{ color: loading ? undefined : gainColor }}>
            {loading
              ? "…"
              : totalGainPct === null
              ? "—"
              : `${totalGainPct >= 0 ? "+" : "-"}${Math.abs(totalGainPct).toFixed(2)}%`}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, summarizeWheelIncome, WHEEL_INCOME_ACCOUNTS } from "@/lib/dashboard/income";
import type { WheelIncomeSummary, WheelTradeIncomeRow } from "@/lib/types/dashboard";

const EMPTY_SUMMARY: WheelIncomeSummary = {
  brokerage: { total: 0, realized: 0 },
  traditional: { total: 0, realized: 0 },
  roth: { total: 0, realized: 0 },
};

const ACCOUNT_LABELS: Record<string, string> = {
  brokerage: "Brokerage",
  traditional: "Traditional IRA",
  roth: "Roth IRA",
};

export default function IncomeCard() {
  const [summary, setSummary] = useState<WheelIncomeSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("wheel_trades")
        .select("premium,contracts,status,account_type")
        .eq("user_id", user.id);

      if (cancelled) return;
      const rows: WheelTradeIncomeRow[] = error ? [] : data || [];
      setSummary(summarizeWheelIncome(rows));
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

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Options Income</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {WHEEL_INCOME_ACCOUNTS.map((acct) => {
          const b = summary[acct];
          return (
            <div key={acct} className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 text-xs font-medium text-text-muted">
                {ACCOUNT_LABELS[acct]}
              </div>
              <div
                id={`dash-income-${acct}-total`}
                className="text-lg font-semibold text-text-primary"
              >
                {loading ? "…" : money(b.total)}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Realized:{" "}
                <span id={`dash-income-${acct}-realized`} className="text-text-primary">
                  {loading ? "…" : money(b.realized)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

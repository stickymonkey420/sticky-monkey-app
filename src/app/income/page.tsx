"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import IncomeByAccountCards from "@/components/income/IncomeByAccountCards";
import IncomeHistoryChart from "@/components/dashboard/IncomeHistoryChart";
import { createClient } from "@/lib/supabase/client";
import { fetchAccountTypeOptions } from "@/lib/options/queries";
import type { AccountTypeOption } from "@/lib/options/types";

// Port of the live Webflow "Income" page (page id 6a9532ef6720b273eadf12c3).
// The page's own custom code was empty -- fetching the live static page
// confirmed the real content: a "Premium Collected" breakdown per
// wheel-eligible account (Brokerage/Taxable, Traditional IRA, Roth IRA)
// shown side by side, plus an Income History section. Both pieces are
// directly reused from already-ported pages: the per-account summary math
// from Options (see components/income/IncomeByAccountCards.tsx) and the
// history chart verbatim from the Dashboard.
export default function IncomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountTypeOption[]>([]);
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
      if (!cancelled) setUserId(user.id);

      const rows = await fetchAccountTypeOptions(supabase);
      if (cancelled) return;
      setAccounts(rows);
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
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Income</h1>
      </div>
      <div className="flex flex-col gap-6">
        <IncomeByAccountCards userId={userId} accounts={accounts} loading={loading} />
        <IncomeHistoryChart />
      </div>
    </AppShell>
  );
}

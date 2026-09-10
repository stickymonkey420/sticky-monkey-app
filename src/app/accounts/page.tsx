"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import AccountsSummaryCards from "@/components/accounts/AccountsSummaryCards";
import AccountsByCategoryTable from "@/components/accounts/AccountsByCategoryTable";
import { createClient } from "@/lib/supabase/client";
import { fetchManualAccounts } from "@/lib/accounts/queries";
import { computeAccountsSummary, groupAccountsByCategory } from "@/lib/accounts/calc";
import type { ManualAccount } from "@/lib/accounts/types";

// Read-only port of the live Webflow "Banking" page (Designer title
// "Accounts", slug invest-accounts, page id 6a858f3b38fe00bf9eef4550,
// relabeled "Banking" everywhere by a client-side script). The live page's
// own custom code is entirely about ADDING accounts (a manual-entry modal
// plus a Plaid Link flow that calls the plaid-create-link-token /
// plaid-exchange-public-token edge functions) -- none of that is ported
// yet. This first increment is just the read-only account list, same
// read-then-write split as every other page here; Add/Connect is a later
// increment gated the same way manual_accounts writes are (paid/
// app_director only, per RLS).
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<ManualAccount[]>([]);
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
          setLoading(false);
        }
        return;
      }

      const rows = await fetchManualAccounts(supabase, user.id);
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

  const summary = useMemo(() => computeAccountsSummary(accounts), [accounts]);
  const groups = useMemo(() => groupAccountsByCategory(accounts), [accounts]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Banking</h1>
      </div>
      <div className="flex flex-col gap-6">
        <AccountsSummaryCards summary={summary} loading={loading} />
        <AccountsByCategoryTable groups={groups} loading={loading} />
      </div>
    </AppShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import AccountTabs from "@/components/options/AccountTabs";
import PremiumSummaryCards from "@/components/options/PremiumSummaryCards";
import OpenPositionsTable from "@/components/options/OpenPositionsTable";
import { createClient } from "@/lib/supabase/client";
import { fetchAccountTypeOptions } from "@/lib/options/queries";
import type { AccountTypeOption } from "@/lib/options/types";

// First (read-only) increment of the ported Options page: account tabs +
// premium summary + open positions, all sourced from the same tables the
// live Webflow page's script reads. The Add/Edit/Roll/Buy-to-Close modals
// from that script are mutations and are a later increment -- this page
// owns the selected-account state and hands it down to the two data
// widgets below, the same shared-state role Dashboard's page.tsx plays for
// its cards (though those don't need cross-card shared state, so this page
// is a client component where that one isn't).
export default function OptionsPage() {
  const [accountOptions, setAccountOptions] = useState<AccountTypeOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoadingAccounts(false);
        return;
      }

      const rows = await fetchAccountTypeOptions(supabase);
      if (cancelled) return;
      setAccountOptions(rows);
      setSelectedAccount((prev) => prev ?? rows[0]?.id ?? null);
      setLoadingAccounts(false);
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
      <h1 className="mb-6 text-xl font-semibold text-text-primary">Options</h1>
      <div className="flex flex-col gap-6">
        <AccountTabs
          options={accountOptions}
          selected={selectedAccount}
          onSelect={setSelectedAccount}
          loading={loadingAccounts}
        />
        <PremiumSummaryCards accountType={selectedAccount} />
        <OpenPositionsTable accountType={selectedAccount} />
      </div>
    </AppShell>
  );
}

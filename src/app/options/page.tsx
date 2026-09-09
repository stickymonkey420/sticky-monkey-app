"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import AccountTabs from "@/components/options/AccountTabs";
import PremiumSummaryCards from "@/components/options/PremiumSummaryCards";
import OpenPositionsTable from "@/components/options/OpenPositionsTable";
import AddEditTradeModal from "@/components/options/AddEditTradeModal";
import { createClient } from "@/lib/supabase/client";
import { fetchAccountTypeOptions, fetchCostBasis } from "@/lib/options/queries";
import { addTrade } from "@/lib/options/mutations";
import type { AccountTypeOption } from "@/lib/options/types";

// Second (write) increment of the ported Options page: adds the top-level
// "+ Add Trade" button (and the ?openTrade=1 auto-open behavior used by
// the Dashboard's Quick Access card) on top of the read-only account
// tabs + premium summary + open positions from the first increment. Row-
// level mutations (Edit/Delete/Mark as.../Roll) live inside
// OpenPositionsTable, which is wired to the same lib/options/mutations.ts
// functions used here.
export default function OptionsPage() {
  const [accountOptions, setAccountOptions] = useState<AccountTypeOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  // Lazy initializer (not an effect) reads the ?openTrade=1 query param
  // used by the Dashboard's "+ Add Option Trade" Quick Access button, so
  // the modal is already open on the very first render instead of
  // flashing closed-then-open a tick later.
  const [addModalOpen, setAddModalOpen] = useState(
    () => typeof window !== "undefined" && /(^|[?&])openTrade=1($|&)/.test(window.location.search)
  );
  const [refreshKey, setRefreshKey] = useState(0);

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
      if (!cancelled) setUserId(user.id);

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

  // Clean the ?openTrade=1 query param back out of the URL once it's been
  // used to open the modal above -- ported from the same
  // history.replaceState cleanup in the live Webflow page's script. No
  // state to set here (the modal's initial value already read the param),
  // so this is a plain one-time DOM/history sync, not a data fetch.
  useEffect(() => {
    if (/(^|[?&])openTrade=1($|&)/.test(window.location.search)) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, []);

  function handleChanged() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Options</h1>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          disabled={!selectedAccount}
          className="rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#4f8cff" }}
        >
          + Add Trade
        </button>
      </div>
      <div className="flex flex-col gap-6">
        <AccountTabs
          options={accountOptions}
          selected={selectedAccount}
          onSelect={setSelectedAccount}
          loading={loadingAccounts}
        />
        <PremiumSummaryCards accountType={selectedAccount} refreshKey={refreshKey} />
        <OpenPositionsTable
          accountType={selectedAccount}
          accountOptions={accountOptions}
          refreshKey={refreshKey}
          onChanged={handleChanged}
        />
      </div>

      {addModalOpen && selectedAccount && (
        <AddEditTradeModal
          mode="add"
          accountOptions={accountOptions}
          defaultAccountType={selectedAccount}
          onClose={() => setAddModalOpen(false)}
          onSaved={handleChanged}
          onSubmit={async (input) => {
            if (!userId) return { error: "not_signed_in" };
            const supabase = createClient();
            return addTrade(supabase, userId, input);
          }}
          lookupCostBasis={async (ticker, acct) => {
            if (!userId) return null;
            const supabase = createClient();
            return fetchCostBasis(supabase, userId, ticker, acct);
          }}
        />
      )}
    </AppShell>
  );
}

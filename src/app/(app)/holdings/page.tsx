"use client";

import { useEffect, useState } from "react";
import HoldingsSummary from "@/components/holdings/HoldingsSummary";
import HoldingsTable from "@/components/holdings/HoldingsTable";
import { createClient } from "@/lib/supabase/client";
import { fetchAccountTypeOptions } from "@/lib/holdings/queries";
import type { AccountTypeOption } from "@/lib/holdings/types";

// Holdings page: equity/crypto positions from the `positions` table.
// Unlike Options (tabbed per wheel-eligible account), there's no tab UI
// here -- by default it shows every account's holdings together, and only
// narrows to one account when linked to with a `?account=<id>` query
// param (e.g. a future Dashboard deep link), the same
// read-window-search-then-clean-the-param approach Options' page.tsx uses
// for its own `?openTrade=1`.
export default function HoldingsPage() {
  // Lazy initializer (not an effect) so an account-scoped deep link never
  // flashes "all accounts" for a tick before narrowing.
  const [accountParam] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const match = window.location.search.match(/[?&]account=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  const [accountOptions, setAccountOptions] = useState<AccountTypeOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const rows = await fetchAccountTypeOptions(supabase);
      if (cancelled) return;
      setAccountOptions(rows);
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

  // Clean the ?account=... query param back out of the URL once accounts
  // have loaded -- same history.replaceState cleanup Options' page.tsx
  // does for ?openTrade=1.
  useEffect(() => {
    if (loadingAccounts) return;
    if (window.location.search.match(/[?&]account=/)) {
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [loadingAccounts]);

  // Only filter when `?account=` actually names a configured account -- an
  // unknown/stale id falls back to showing everything instead of an empty
  // table.
  const selectedAccount =
    accountParam && accountOptions.some((opt) => opt.id === accountParam) ? accountParam : null;
  const selectedLabel = selectedAccount ? accountOptions.find((opt) => opt.id === selectedAccount)?.label : null;

  function handleChanged() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">
          Holdings{selectedLabel ? ` — ${selectedLabel}` : ""}
        </h1>
      </div>
      {loadingAccounts ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : (
        <div className="flex flex-col gap-6">
          <HoldingsSummary accountType={selectedAccount} refreshKey={refreshKey} />
          <HoldingsTable
            accountType={selectedAccount}
            accountOptions={accountOptions}
            refreshKey={refreshKey}
            onChanged={handleChanged}
          />
        </div>
      )}
    </>
  );
}

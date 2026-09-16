"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import HoldingsSummary from "@/components/holdings/HoldingsSummary";
import HoldingsTable from "@/components/holdings/HoldingsTable";
import { createClient } from "@/lib/supabase/client";
import { fetchAccountTypeOptions } from "@/lib/holdings/queries";
import type { AccountTypeOption } from "@/lib/holdings/types";

// Holdings page: equity/crypto positions from the `positions` table.
// Unlike Options (tabbed per wheel-eligible account), there's no tab UI
// here -- by default it shows every account's holdings together, and only
// narrows to one account when linked to with a `?account=<id>` query param
// (the sidebar's Brokerage/Crypto/Traditional IRA/Roth IRA links -- see
// AppShell.tsx). That query param IS the filter's state -- it's persistent,
// not a one-shot trigger (unlike Options' `?openTrade=1`), so it's meant to
// stay in the URL and in the address bar/back button/refresh/shared link.
//
// This used to read `window.location.search` via a useState lazy
// initializer, which only runs on the component's first mount. The sidebar
// links are next/link client-side navigations to the SAME route
// (/holdings) with just a different query string, so the App Router
// reuses the already-mounted page instead of remounting it -- the lazy
// initializer never re-ran, so clicking Brokerage after Crypto kept
// showing every account. useSearchParams() is the App Router's reactive
// hook for this exact case: it re-renders on every navigation to this
// route, including ones that only change the query string.
//
// A follow-up attempt also tried scrubbing `?account=` back out of the URL
// once accounts loaded (via router.replace). That broke the filter
// entirely: since `selectedAccount` below is derived live from the query
// param with no separate persisted state, clearing the param immediately
// undid the filter right after it was applied. No code in this app links
// to a bare `/holdings` without a query param, so there's no case that
// needs the param scrubbed -- it just stays in the URL.
function HoldingsPageInner() {
  const searchParams = useSearchParams();
  const accountParam = searchParams.get("account");

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

// useSearchParams() requires a Suspense boundary for production builds (it
// bails a statically-rendered page out to client-side rendering up to the
// nearest one) -- the fallback only ever shows for a moment since accounts
// load fast and there's no server data this page needs first.
export default function HoldingsPage() {
  return (
    <Suspense fallback={<div className="text-sm text-text-muted">Loading…</div>}>
      <HoldingsPageInner />
    </Suspense>
  );
}

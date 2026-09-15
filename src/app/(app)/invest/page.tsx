"use client";

import { useEffect, useMemo, useState } from "react";
import PortfolioDonutCard from "@/components/invest/PortfolioDonutCard";
import VaultSummary from "@/components/invest/VaultSummary";
import { createClient } from "@/lib/supabase/client";
import { fetchHoldings, fetchMetalHoldings } from "@/lib/invest/queries";
import { groupByAccountDonut, groupMetalsDonut } from "@/lib/invest/calc";
import type { Holding, MetalHolding } from "@/lib/invest/types";

// Account-type donut buckets shown above the Vault -- one card per
// wheel/brokerage account_type plus Crypto, all sourced from the same
// `positions` fetch (grouped client-side per bucket via
// groupByAccountDonut()) instead of one fetch per card, so adding a card
// never costs another round trip to Supabase.
const ACCOUNT_BUCKETS: { accountType: string; title: string; emptyLabel: string }[] = [
  { accountType: "brokerage", title: "Brokerage", emptyLabel: "No brokerage positions yet." },
  { accountType: "traditional", title: "Traditional IRA", emptyLabel: "No Traditional IRA positions yet." },
  { accountType: "roth", title: "Roth IRA", emptyLabel: "No Roth IRA positions yet." },
  { accountType: "crypto", title: "Crypto", emptyLabel: "No crypto positions yet." },
];

// First (read-only) increment of the ported Invest page: the Portfolio
// Allocation donuts (Brokerage/Traditional IRA/Roth IRA/Crypto/Metals) and
// a read-only Vault holdings list. Add Holding, Vault Edit/Delete, Add
// Investment Account, Plaid connect, and the Insurance Report are later
// (write) increments -- same read-then-write split Options and Holdings
// each went through.
//
// Which cards actually render is now driven by profiles.account_types --
// the same "Account Types" checkboxes in MyProfileModal that also gate the
// "Investments" nav item itself (see AppShell's "investOptIn" gate). Ticking
// "Crypto" is what puts the Crypto card here; nothing is shown for an
// account type the user hasn't opted into, paid tier included -- this page
// only ever reflects the explicit opt-in, not the role.
export default function InvestPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [metalHoldings, setMetalHoldings] = useState<MetalHolding[]>([]);
  const [accountTypes, setAccountTypes] = useState<string[]>([]);
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
          setMetalHoldings([]);
          setAccountTypes([]);
          setLoading(false);
        }
        return;
      }

      // One fetch per table, shared across every donut card + the Vault
      // list below -- not one fetch per account_type bucket.
      const [holdingRows, metalRows, profileRow] = await Promise.all([
        fetchHoldings(supabase, user.id, null),
        fetchMetalHoldings(supabase, user.id),
        supabase.from("profiles").select("account_types").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setHoldings(holdingRows);
      setMetalHoldings(metalRows);
      setAccountTypes((profileRow.data as { account_types: string[] | null } | null)?.account_types ?? []);
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

  // While the initial fetch is still in flight, show every bucket in its
  // loading state (matching this page's previous behavior) rather than
  // filtering against accountTypes' not-yet-loaded [] default, which would
  // otherwise flash down to nothing for a moment on every page load.
  const accountDonuts = useMemo(
    () =>
      (loading ? ACCOUNT_BUCKETS : ACCOUNT_BUCKETS.filter((b) => accountTypes.includes(b.accountType))).map((b) => ({
        ...b,
        donut: groupByAccountDonut(holdings, b.accountType),
      })),
    [holdings, accountTypes, loading]
  );
  const metalsDonut = useMemo(() => groupMetalsDonut(metalHoldings), [metalHoldings]);
  // Metal holdings (metal_holdings table) cover both the "metals" and
  // "sdira" account types (see fetchMetalHoldings/groupMetalsDonut) --
  // there's no separate SDIRA card, so either box ticked is enough to show
  // this one.
  const showMetals = loading || accountTypes.includes("metals") || accountTypes.includes("sdira");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Investments</h1>
      </div>
      <div className="flex flex-col gap-6">
        {!loading && accountDonuts.length === 0 && !showMetals ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
            No account types selected yet. Tick at least one under Profile &gt; Account Types to start tracking it
            here.
          </div>
        ) : (
          /* auto-rows-fr + each card set to h-full (see PortfolioDonutCard)
             stretches every card in a row to match the row's tallest --
             without it, a short card (e.g. Roth IRA with 1-2 slices) sits
             next to a tall one (13-row legend) and the row reads as uneven
             even though the grid columns themselves are already equal-width. */
          <div className="grid grid-cols-1 gap-6 auto-rows-fr md:grid-cols-2 xl:grid-cols-3">
            {accountDonuts.map((b) => (
              <PortfolioDonutCard
                key={b.accountType}
                id={b.accountType === "brokerage" ? "eq-brokerage-card" : undefined}
                title={b.title}
                slices={b.donut.slices}
                total={b.donut.total}
                loading={loading}
                emptyLabel={b.emptyLabel}
              />
            ))}
            {showMetals && (
              <PortfolioDonutCard
                title="Metals"
                slices={metalsDonut.slices}
                total={metalsDonut.total}
                loading={loading}
                emptyLabel="No metals in the vault yet."
              />
            )}
          </div>
        )}

        <div id="vault-section">
          <VaultSummary holdings={metalHoldings} loading={loading} />
        </div>
      </div>
    </>
  );
}

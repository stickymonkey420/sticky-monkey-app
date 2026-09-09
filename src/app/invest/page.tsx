"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
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
export default function InvestPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [metalHoldings, setMetalHoldings] = useState<MetalHolding[]>([]);
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
          setLoading(false);
        }
        return;
      }

      // One fetch per table, shared across every donut card + the Vault
      // list below -- not one fetch per account_type bucket.
      const [holdingRows, metalRows] = await Promise.all([
        fetchHoldings(supabase, user.id, null),
        fetchMetalHoldings(supabase, user.id),
      ]);
      if (cancelled) return;
      setHoldings(holdingRows);
      setMetalHoldings(metalRows);
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

  const accountDonuts = useMemo(
    () => ACCOUNT_BUCKETS.map((b) => ({ ...b, donut: groupByAccountDonut(holdings, b.accountType) })),
    [holdings]
  );
  const metalsDonut = useMemo(() => groupMetalsDonut(metalHoldings), [metalHoldings]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Invest</h1>
      </div>
      <div className="flex flex-col gap-6">
        {/* auto-rows-fr + each card set to h-full (see PortfolioDonutCard)
            stretches every card in a row to match the row's tallest --
            without it, a short card (e.g. Roth IRA with 1-2 slices) sits
            next to a tall one (13-row legend) and the row reads as uneven
            even though the grid columns themselves are already equal-width. */}
        <div className="grid grid-cols-1 gap-6 auto-rows-fr md:grid-cols-2 xl:grid-cols-3">
          {accountDonuts.map((b) => (
            <PortfolioDonutCard
              key={b.accountType}
              title={b.title}
              slices={b.donut.slices}
              total={b.donut.total}
              loading={loading}
              emptyLabel={b.emptyLabel}
            />
          ))}
          <PortfolioDonutCard
            title="Metals"
            slices={metalsDonut.slices}
            total={metalsDonut.total}
            loading={loading}
            emptyLabel="No metals in the vault yet."
          />
        </div>

        <VaultSummary holdings={metalHoldings} loading={loading} />
      </div>
    </AppShell>
  );
}

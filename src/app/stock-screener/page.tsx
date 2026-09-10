"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/layout/AppShell";
import ScreenerFilters from "@/components/screener/ScreenerFilters";
import ScreenerTable from "@/components/screener/ScreenerTable";
import TickerLookup from "@/components/screener/TickerLookup";
import { createClient } from "@/lib/supabase/client";
import { distinctSectors, filterAndSort } from "@/lib/screener/calc";
import { fetchStockUniverse } from "@/lib/screener/queries";
import { DEFAULT_FILTERS } from "@/lib/screener/types";
import type { ScreenerFilters as Filters, StockUniverseRow } from "@/lib/screener/types";

// Port of the live Webflow "Stock Screener" page (page id
// 6a75af701b806a8688055696): a filterable/sortable table over the curated
// `stock_universe` table, plus a ticker-lookup card with live quotes and
// two Peter Lynch valuation gauges (see components/screener/TickerLookup
// and lib/screener/*). Both pieces were fully self-contained and
// well-specified in the page's own custom code -- ported 1:1, filters and
// sort included.
export default function StockScreenerPage() {
  const [rows, setRows] = useState<StockUniverseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

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
      const universe = await fetchStockUniverse(supabase);
      if (cancelled) return;
      setRows(universe);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sectors = useMemo(() => distinctSectors(rows), [rows]);
  const filtered = useMemo(() => filterAndSort(rows, filters), [rows, filters]);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text-primary">Stock Screener</h1>
      </div>
      <div className="flex flex-col gap-6">
        <TickerLookup />
        <div className="rounded-2xl border border-card-border bg-card-bg p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">Filter the Universe</h3>
          <ScreenerFilters filters={filters} onChange={setFilters} sectors={sectors} />
        </div>
        {loading ? (
          <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">
            Loading stock universe…
          </div>
        ) : (
          <ScreenerTable rows={filtered} total={rows.length} />
        )}
      </div>
    </AppShell>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_COLORS, money, summarizeNetWorth } from "@/lib/dashboard/netWorth";
import type { ManualAccount, NetWorthSummary } from "@/lib/types/dashboard";

const EMPTY_SUMMARY: NetWorthSummary = {
  categories: [],
  totalAssets: 0,
  totalLiabilities: 0,
  netWorth: 0,
};

export default function NetWorthCard() {
  const [summary, setSummary] = useState<NetWorthSummary>(EMPTY_SUMMARY);
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
        .from("manual_accounts")
        .select("category,account_name,balance")
        .eq("user_id", user.id);

      if (cancelled) return;
      const accounts: ManualAccount[] = error ? [] : data || [];
      setSummary(summarizeNetWorth(accounts));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const { categories, totalAssets, totalLiabilities, netWorth } = summary;

  let gradient = "none";
  if (categories.length && totalAssets > 0) {
    const parts: string[] = [];
    let cursor = 0;
    categories.forEach((c) => {
      const pct = (c.value / totalAssets) * 100;
      const start = cursor;
      const end = cursor + pct;
      parts.push(`${CATEGORY_COLORS[c.name] || "#888888"} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      cursor = end;
    });
    gradient = `conic-gradient(${parts.join(", ")})`;
  }

  return (
    <div id="nw-row" className="flex flex-col gap-6 md:flex-row">
      {/* Asset Allocation card */}
      <div
        id="nw-pie-card"
        className="featured-border flex-1 rounded-2xl bg-card-bg p-5"
      >
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Asset Allocation</h3>
        <div className="flex items-center gap-6">
          <div className="relative h-24 w-24 shrink-0">
            <div
              className="h-24 w-24 rounded-full"
              style={{ backgroundImage: gradient }}
            />
            <div
              className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full p-1.5 text-center text-xs font-medium text-text-primary"
              style={{ backgroundColor: "hsla(221.05, 31.15%, 11.96%, 0.92)" }}
            >
              {loading ? "…" : money(totalAssets)}
            </div>
          </div>
          <div className="flex-1">
            {loading ? (
              <div className="text-sm text-text-muted">Loading…</div>
            ) : categories.length === 0 ? (
              <div className="text-sm text-text-muted">No asset data yet.</div>
            ) : (
              categories.map((c) => {
                const pct = totalAssets > 0 ? (c.value / totalAssets) * 100 : 0;
                return (
                  <div
                    key={c.name}
                    className="flex items-center justify-between gap-3 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLORS[c.name] || "#888888" }}
                      />
                      <span className="text-sm text-text-primary">{c.name}</span>
                    </div>
                    <div className="text-sm text-text-muted">
                      {money(c.value)} ({pct.toFixed(0)}%)
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Net Worth card */}
      <div
        id="nw-card"
        className="featured-border flex-1 rounded-2xl bg-card-bg p-5"
      >
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Net Worth</h3>
        <div id="nw-net-worth-value" className="mb-4 text-3xl font-semibold text-text-primary">
          {loading ? "…" : money(netWorth)}
        </div>
        <div className="flex items-center justify-between border-t border-card-border pt-3 text-sm">
          <span className="text-text-muted">Total Assets</span>
          <span id="nw-total-assets" className="font-medium text-text-primary">
            {loading ? "…" : money(totalAssets)}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-text-muted">Total Liabilities</span>
          <span id="nw-total-liabilities" className="font-medium text-text-primary">
            {loading ? "…" : money(totalLiabilities)}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_COLORS, money, summarizeNetWorth } from "@/lib/dashboard/netWorth";
import { computeIncomeTable, PROJECTED_ROW, type IncomeTableRow, type IncomeTableTrade } from "@/lib/dashboard/incomeTable";
import type { ManualAccount, NetWorthSummary } from "@/lib/types/dashboard";

const EMPTY_SUMMARY: NetWorthSummary = {
  categories: [],
  totalAssets: 0,
  totalLiabilities: 0,
  netWorth: 0,
};

// 2-decimal formatter for the Income table cells -- distinct from the
// whole-dollar `money()` used for Net Worth/Total Assets/Liabilities,
// matching the live site's own formatting split ("$607,893" vs "$617.00").
function money2(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Card chrome matches the live Webflow Dashboard's own cards exactly
// (sampled via getComputedStyle): solid rgb(21,27,40) fill, 30px radius,
// no border -- not the app's generic bordered rounded-2xl card used
// elsewhere.
const CARD_CLASS = "rounded-[30px] p-[30px]";
const CARD_BG = "#151b28";
// Webflow's #nw-pie-card is its own fixed-ish width (~341px measured via
// getComputedStyle on the live site), not an equal flex-1 split with Net
// Worth -- Net Worth is wider because it also carries the Income table.
// Asset Allocation stays full-width on mobile and caps at that width from
// md up; Net Worth keeps flex-1 to fill whatever's left.
const PIE_CARD_CLASS = `${CARD_CLASS} w-full shrink-0 md:w-[341px]`;
const NW_CARD_CLASS = `${CARD_CLASS} min-w-0 flex-1`;

export default function NetWorthCard() {
  const [summary, setSummary] = useState<NetWorthSummary>(EMPTY_SUMMARY);
  const [incomeRows, setIncomeRows] = useState<IncomeTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Whether there's anything behind this card at all -- any manual account
  // (feeds Asset Allocation/Net Worth) or any wheel trade (feeds the Income
  // table) -- per your call to hide zero/not-applicable Dashboard cards
  // rather than show an all-$0 shell. null while unknown (still loading)
  // hides the card too, same "hide until known" rule used elsewhere.
  const [hasData, setHasData] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setHasData(false);
          setLoading(false);
        }
        return;
      }

      const [{ data: accountData, error: accountErr }, { data: tradeData, error: tradeErr }] = await Promise.all([
        supabase.from("manual_accounts").select("category,account_name,balance").eq("user_id", user.id),
        supabase
          .from("wheel_trades")
          .select("premium,contracts,status,account_type,entry_date,strike,trade_type")
          .eq("user_id", user.id),
      ]);

      if (cancelled) return;
      const accounts: ManualAccount[] = accountErr ? [] : accountData || [];
      setSummary(summarizeNetWorth(accounts));
      const trades: IncomeTableTrade[] = tradeErr ? [] : tradeData || [];
      setIncomeRows(computeIncomeTable(trades));
      setHasData(accounts.length > 0 || trades.length > 0);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasData === false) return null;

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
      <div id="nw-pie-card" className={PIE_CARD_CLASS} style={{ backgroundColor: CARD_BG }}>
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Asset Allocation</h3>
        {/* Webflow's own #nw-pie-card stacks the donut on top of the legend
            list (donut centered, legend rows full-width below) -- it does
            NOT put them side by side. Confirmed via getComputedStyle on the
            live site: #nw-pie-legend renders below #nw-pie-chart-wrap
            (y=381 vs donut bottom at y=351), and the donut itself is a
            160px ring around a 76px hole, not the smaller 96px/76px ring
            this card used before. */}
        <div className="flex flex-col items-center gap-6">
          <div className="relative h-40 w-40 shrink-0">
            <div className="h-40 w-40 rounded-full" style={{ backgroundImage: gradient }} />
            <div
              className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full p-1.5 text-center text-xs font-medium text-text-primary"
              style={{
                backgroundColor: CARD_BG,
                boxShadow: "inset 0 2px 8px rgba(0,0,0,0.35), inset 0 -1px 3px rgba(255,255,255,0.05)",
              }}
            >
              {loading ? "…" : money(totalAssets)}
            </div>
          </div>
          <div className="w-full">
            {loading ? (
              <div className="text-sm text-text-muted">Loading…</div>
            ) : categories.length === 0 ? (
              <div className="text-sm text-text-muted">No asset data yet.</div>
            ) : (
              categories.map((c) => {
                const pct = totalAssets > 0 ? (c.value / totalAssets) * 100 : 0;
                return (
                  <div key={c.name} className="flex items-center justify-between gap-3 py-1.5">
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

      {/* Net Worth card -- big number, Total Assets/Liabilities side by
          side, and an embedded Income (Week/Month/YTD/Collateral) table,
          matching the live site's layout exactly rather than stacking
          Income as its own separate widget. */}
      <div id="nw-card" className={NW_CARD_CLASS} style={{ backgroundColor: CARD_BG }}>
        <h3 className="mb-4 text-sm font-semibold text-text-primary">Net Worth</h3>
        <div id="nw-net-worth-value" className="mb-4 text-4xl font-bold text-text-primary">
          {loading ? "…" : money(netWorth)}
        </div>
        <div className="flex items-center gap-10 text-sm">
          <div>
            <div className="text-text-muted">Total Assets</div>
            <div id="nw-total-assets" className="mt-1 font-semibold" style={{ color: "#3ddc97" }}>
              {loading ? "…" : money(totalAssets)}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Total Liabilities</div>
            <div id="nw-total-liabilities" className="mt-1 font-semibold" style={{ color: "#eb5757" }}>
              {loading ? "…" : money(totalLiabilities)}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="mb-3 text-sm font-semibold text-text-primary">Income</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="pb-2 pr-3 font-semibold">Account</th>
                  <th className="pb-2 pr-3 font-semibold">Week</th>
                  <th className="pb-2 pr-3 font-semibold">Month</th>
                  <th className="pb-2 pr-3 font-semibold">YTD</th>
                  <th className="pb-2 font-semibold">Collateral</th>
                </tr>
              </thead>
              <tbody>
                {[...incomeRows, PROJECTED_ROW].map((row) => (
                  <tr key={row.account} className="border-t border-white/[0.06]">
                    <td className={`py-2 pr-3 ${row.account === "Projected" ? "italic text-text-muted" : "font-medium text-text-primary"}`}>
                      {row.account}
                    </td>
                    <td className="py-2 pr-3" style={{ color: "#3ddc97" }}>
                      {loading ? "…" : money2(row.week)}
                    </td>
                    <td className="py-2 pr-3" style={{ color: "#3ddc97" }}>
                      {loading ? "…" : money2(row.month)}
                    </td>
                    <td className="py-2 pr-3" style={{ color: "#f2c14e" }}>
                      {loading ? "…" : Number.isNaN(row.ytd) ? "—" : money2(row.ytd)}
                    </td>
                    <td className="py-2" style={{ color: "#eb5757" }}>
                      {loading ? "…" : row.collateral === null ? "—" : money2(row.collateral)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { money } from "@/lib/options/queries";
import type { MetalHolding } from "@/lib/invest/types";

type VaultSummaryProps = {
  holdings: MetalHolding[];
  accountNames?: Record<string, string>;
  loading: boolean;
};

type VaultTab = "all" | "metals" | "sdira";
const TABS: { id: VaultTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "metals", label: "Personal" },
  { id: "sdira", label: "Self-Directed IRA" },
];

function totals(rows: MetalHolding[]) {
  return {
    count: rows.length,
    value: rows.reduce((sum, h) => sum + (Number(h.current_value) || 0), 0),
    cost: rows.reduce((sum, h) => sum + (Number(h.acquisition_cost) || 0), 0),
  };
}

// Read-only list of every metal_holdings row (across both the "metals" and
// "sdira" account types -- see fetchMetalHoldings()), plus a one-line
// summary. Purely presentational, same fetch-once-in-the-parent split as
// PortfolioDonutCard: invest/page.tsx already fetches this same list for
// the Metals donut card, so this reuses it instead of querying twice.
//
// Add/Edit/Delete for vault holdings are a later (write) increment -- this
// is display only, mirroring how HoldingsTable/PremiumSummaryCards started
// read-only before Options/Holdings grew mutations.
export default function VaultSummary({ holdings: allHoldings, accountNames = {}, loading }: VaultSummaryProps) {
  const [tab, setTab] = useState<VaultTab>("all");
  // "Personal" = account_type metals; "Self-Directed IRA" = sdira.
  const byTab = {
    all: allHoldings,
    metals: allHoldings.filter((h) => h.account_type !== "sdira"),
    sdira: allHoldings.filter((h) => h.account_type === "sdira"),
  };
  const holdings = byTab[tab];
  const sub = { metals: totals(byTab.metals), sdira: totals(byTab.sdira) };
  const { count: itemCount, value: totalCurrentValue, cost: totalAcquisitionCost } = totals(holdings);
  const accountLabel = (h: MetalHolding) =>
    (h.account_id && accountNames[h.account_id]) || (h.account_type === "sdira" ? "Self-Directed IRA" : "Personal");

  return (
    <div id="vault-section" className="rounded-2xl border border-card-border bg-card-bg p-5 scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-text-primary">Vault</h3>
        <div className="flex gap-1 rounded-full bg-white/5 p-1 text-xs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1 font-semibold ${tab === t.id ? "bg-[#4f8cff] text-white" : "text-text-muted hover:text-text-primary"}`}
            >
              {t.label}
              <span className="ml-1 opacity-70">{byTab[t.id].length}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "all" && !loading && allHoldings.length > 0 && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["Personal", sub.metals],
              ["Self-Directed IRA", sub.sdira],
            ] as const
          ).map(([label, t]) => (
            <div key={label} className="rounded-xl bg-white/5 p-3 text-xs">
              <div className="mb-1 font-semibold text-text-primary">
                {label} <span className="font-normal text-text-muted">· {t.count} item{t.count === 1 ? "" : "s"}</span>
              </div>
              <div className="text-text-muted">
                Value <span className="font-medium text-text-primary">{money(t.value)}</span> · Cost{" "}
                <span className="font-medium text-text-primary">{money(t.cost)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-card-border pb-4 text-sm">
        <span className="text-text-muted">
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </span>
        <span className="text-text-muted">
          Total Value <span className="font-medium text-text-primary">{money(totalCurrentValue)}</span>
        </span>
        <span className="text-text-muted">
          Total Cost <span className="font-medium text-text-primary">{money(totalAcquisitionCost)}</span>
        </span>
      </div>

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : holdings.length === 0 ? (
        <div className="text-sm text-text-muted">
          {tab === "sdira" ? "No metals in a Self-Directed IRA yet." : tab === "metals" ? "No personal metals yet." : "No metal holdings in the vault yet."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Product
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Metal
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4">
                  Account
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Quantity
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Ounces
                </th>
                <th scope="col" className="whitespace-nowrap py-2 pr-4 text-right">
                  Current Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td className="py-2.5 pr-4 font-medium text-text-primary">{h.product_name}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">{h.metal ?? "—"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        h.account_type === "sdira" ? "bg-[#a855f7]/20 text-[#c79bff]" : "bg-[#f5d020]/15 text-[#f5d020]"
                      }`}
                    >
                      {accountLabel(h)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {Number(h.quantity)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {h.ounces === null || h.ounces === undefined ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      Number(h.ounces)
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {money(Number(h.current_value) || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

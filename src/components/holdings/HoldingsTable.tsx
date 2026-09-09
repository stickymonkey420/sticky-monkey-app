"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchHoldings } from "@/lib/holdings/queries";
import { deleteHolding, updateHolding, type HoldingFormInput } from "@/lib/holdings/mutations";
import { compareHoldings, withDerived, type SortColumn, type SortDirection } from "@/lib/holdings/calc";
import { money } from "@/lib/options/queries";
import type { AccountTypeOption, HoldingWithDerived } from "@/lib/holdings/types";
import EditHoldingModal from "./EditHoldingModal";

type HoldingsTableProps = {
  accountType: string | null;
  accountOptions: AccountTypeOption[];
  refreshKey?: number;
  onChanged?: () => void;
};

const ACTION_BTN_CLASS = "rounded-md border border-[#2a2f3f] px-2 py-1 text-xs text-text-primary hover:bg-white/5";

type ColumnDef = { key: SortColumn; label: string; align?: "right" };

const COLUMNS: ColumnDef[] = [
  { key: "ticker", label: "Ticker" },
  { key: "asset_class", label: "Class" },
  { key: "shares", label: "Shares", align: "right" },
  { key: "price", label: "Price", align: "right" },
  { key: "day_change_pct", label: "Day %", align: "right" },
  { key: "cost_basis", label: "Cost Basis", align: "right" },
  { key: "mkt_value", label: "Mkt Value", align: "right" },
  { key: "gain_dollar", label: "Gain $", align: "right" },
  { key: "gain_pct", label: "Gain %", align: "right" },
];

function pctColor(n: number | null): string | undefined {
  if (n === null) return undefined;
  return n >= 0 ? "#3ddc97" : "#ff5c7a";
}

// Sortable Holdings table -- read side follows the same fetch/reload
// pattern as Options' OpenPositionsTable (own load effect keyed on
// accountType/refreshKey/reloadTick, `cancelled` guard, pageshow re-fetch
// for bfcache navigations); Edit/Delete row actions are wired to
// lib/holdings/mutations.ts the same way that table wires Edit/Delete to
// lib/options/mutations.ts.
export default function HoldingsTable({ accountType, accountOptions, refreshKey = 0, onChanged }: HoldingsTableProps) {
  const [holdings, setHoldings] = useState<HoldingWithDerived[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("ticker");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingHolding, setEditingHolding] = useState<HoldingWithDerived | null>(null);
  // Bumped by afterMutation() so this table always reloads its own rows
  // after a row-level mutation, independent of whether the parent also
  // passed an `onChanged` (which only needs to reload the sibling
  // HoldingsSummary) -- same split as OpenPositionsTable's reloadTick.
  const [reloadTick, setReloadTick] = useState(0);

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
          setLoading(false);
        }
        return;
      }

      const rows = await fetchHoldings(supabase, user.id, accountType);
      if (cancelled) return;
      setHoldings(rows.map(withDerived));
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
  }, [accountType, refreshKey, reloadTick]);

  function afterMutation() {
    setReloadTick((t) => t + 1);
    onChanged?.();
  }

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  const sortedHoldings = useMemo(
    () => [...holdings].sort((a, b) => compareHoldings(a, b, sortColumn, sortDirection)),
    [holdings, sortColumn, sortDirection]
  );

  async function handleDelete(h: HoldingWithDerived) {
    if (!window.confirm(`Remove ${h.ticker} from holdings? This cannot be undone.`)) return;
    setActionError(null);
    const supabase = createClient();
    const { error } = await deleteHolding(supabase, h.id);
    if (error) {
      setActionError("Could not remove holding. Try again.");
      return;
    }
    afterMutation();
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Holdings</h3>
      {actionError && <div className="mb-3 text-xs text-[#ff5c7a]">{actionError}</div>}
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : sortedHoldings.length === 0 ? (
        <div className="text-sm text-text-muted">No holdings in this account.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={sortColumn === col.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                    className={`cursor-pointer select-none whitespace-nowrap py-2 pr-4 ${
                      col.align === "right" ? "text-right" : ""
                    }`}
                    onClick={() => handleSort(col.key)}
                  >
                    {col.label}
                    {sortColumn === col.key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
                <th className="whitespace-nowrap py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sortedHoldings.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">{h.ticker}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 capitalize text-text-muted">{h.asset_class}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{Number(h.shares)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {h.price === null ? <span className="text-text-muted">—</span> : money(Number(h.price))}
                  </td>
                  <td
                    className="whitespace-nowrap py-2.5 pr-4 text-right"
                    style={{ color: h.day_change_pct === null ? undefined : pctColor(Number(h.day_change_pct)) }}
                  >
                    {h.day_change_pct === null ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      `${Number(h.day_change_pct) >= 0 ? "+" : ""}${Number(h.day_change_pct).toFixed(2)}%`
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                    {h.cost_basis === null ? <span className="text-text-muted">—</span> : money(Number(h.cost_basis))}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{money(h.mkt_value)}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right" style={{ color: pctColor(h.gain_dollar) }}>
                    {h.gain_dollar >= 0 ? "+" : "-"}
                    {money(Math.abs(h.gain_dollar))}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-right" style={{ color: pctColor(h.gain_pct) }}>
                    {h.gain_pct === null ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      `${h.gain_pct >= 0 ? "+" : "-"}${Math.abs(h.gain_pct).toFixed(2)}%`
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <div className="flex gap-1.5">
                      <button type="button" className={ACTION_BTN_CLASS} onClick={() => setEditingHolding(h)}>
                        Edit
                      </button>
                      <button type="button" className={ACTION_BTN_CLASS} onClick={() => handleDelete(h)}>
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingHolding && (
        <EditHoldingModal
          holding={editingHolding}
          accountOptions={accountOptions}
          onClose={() => setEditingHolding(null)}
          onSaved={afterMutation}
          onSubmit={async (input: HoldingFormInput) => {
            const supabase = createClient();
            return updateHolding(supabase, editingHolding.id, input);
          }}
        />
      )}
    </div>
  );
}

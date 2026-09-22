"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, money } from "@/lib/options/queries";
import { CLOSED_POSITION_TYPE_COLOR, statusLabel } from "@/lib/closedPositions/calc";
import { deleteClosedPosition } from "@/lib/closedPositions/mutations";
import {
  fetchClosedLongOptionTrades,
  fetchClosedWheelTrades,
  normalizeClosedPositions,
} from "@/lib/closedPositions/queries";
import type { ClosedPosition, ClosedPositionAccount } from "@/lib/closedPositions/types";
import { CLOSED_POSITION_ACCOUNTS } from "@/lib/closedPositions/types";

const ACCOUNT_LABEL: Record<ClosedPositionAccount, string> = {
  brokerage: "Individual (Brokerage)",
  traditional: "Traditional IRA",
  roth: "Roth IRA",
};

type FilterValue = "all" | ClosedPositionAccount;

type SortKey = "ticker" | "type" | "strike" | "premium" | "contracts" | "pct" | "closeDate" | "entry";

type SortState = { key: SortKey | null; dir: 1 | -1 };

function getSortVal(p: ClosedPosition, key: SortKey): string | number | null {
  switch (key) {
    case "ticker":
      return p.ticker.toUpperCase();
    case "type":
      return p.type;
    case "strike":
      return p.strike;
    case "premium":
      return p.premCost;
    case "contracts":
      return p.contracts;
    case "pct":
      return p.returnPct === null || Number.isNaN(p.returnPct) ? null : p.returnPct;
    case "closeDate":
      return p.closeDate || "";
    case "entry":
      return p.entryDate || "";
    default:
      return null;
  }
}

function sortRows(rows: ClosedPosition[], key: SortKey, dir: 1 | -1): ClosedPosition[] {
  const copy = rows.slice();
  copy.sort((a, b) => {
    const va = getSortVal(a, key);
    const vb = getSortVal(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });
  return copy;
}

const HEAD_CELLS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "ticker", label: "Ticker" },
  { key: "type", label: "Type" },
  { key: "strike", label: "Strike", numeric: true },
  { key: "premium", label: "Prem/Cost", numeric: true },
  { key: "contracts", label: "Ctr", numeric: true },
  { key: "pct", label: "Return %", numeric: true },
  { key: "closeDate", label: "Close Date" },
  { key: "entry", label: "Entry" },
];

function PctCell({ pct }: { pct: number | null }) {
  if (pct === null || Number.isNaN(pct)) return <span className="text-text-muted">—</span>;
  const isPositive = pct >= 0;
  return (
    <span style={{ color: isPositive ? "#3ddc97" : "#ff5c5c" }}>
      {isPositive ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

// Read-only history table ported from the live Webflow Closed Positions
// page (page_id 6a7702a56745d0a69974f850, slug /closed-positions):
// loadPositions() + rowHtml()/renderPositions() + the per-account column
// sorting and the "All Accounts" / per-account filter bar, all read from
// that page's freeform head code via the Webflow MCP data_scripts_tool.
//
// The source script's per-row "Del" button (a hard delete of the closed-
// trade record) was initially left un-ported -- now added back per your
// explicit request, via src/lib/closedPositions/mutations.ts rather than
// reusing Options' deleteTrade (that one only knows "wheel"/"leap", not
// this page's "wheel"/"long" split). Gated the same way Card Center gates
// add/edit/delete: viewing stays available to any signed-in role (neither
// wheel_trades nor long_option_trades SELECT has a role check), but the
// Delete button only renders for paid/app_director, matching both
// tables' DELETE policies ("Paid users can delete own wheel trades" /
// "...own long option trades"). In practice this page only ever appears
// under the Income nav group, which is already paid-gated -- this is a
// second, defense-in-depth check in case someone reaches the URL
// directly.
export default function ClosedPositionsTable() {
  const confirm = useConfirm();
  const [positions, setPositions] = useState<ClosedPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sortState, setSortState] = useState<Record<ClosedPositionAccount, SortState>>({
    brokerage: { key: null, dir: 1 },
    traditional: { key: null, dir: 1 },
    roth: { key: null, dir: 1 },
  });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      if (!cancelled) {
        setLoading(true);
        setLoadError(false);
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setPositions([]);
          setLoading(false);
        }
        return;
      }

      try {
        const [wheelRows, longRows, profile] = await Promise.all([
          fetchClosedWheelTrades(supabase, user.id),
          fetchClosedLongOptionTrades(supabase, user.id),
          supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        ]);
        if (cancelled) return;
        setPositions(normalizeClosedPositions(wheelRows, longRows));
        if (profile.data) setRole((profile.data as { role: string }).role);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
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

  const byAccount = useMemo(() => {
    const grouped: Record<ClosedPositionAccount, ClosedPosition[]> = {
      brokerage: [],
      traditional: [],
      roth: [],
    };
    positions.forEach((p) => {
      const acct = p.accountType as ClosedPositionAccount;
      if (grouped[acct]) grouped[acct].push(p);
    });
    return grouped;
  }, [positions]);

  function toggleSort(acct: ClosedPositionAccount, key: SortKey) {
    setSortState((prev) => {
      const cur = prev[acct];
      const next: SortState = cur.key === key ? { key, dir: (cur.dir * -1) as 1 | -1 } : { key, dir: 1 };
      return { ...prev, [acct]: next };
    });
  }

  const canDelete = role === "paid" || role === "app_director";

  async function handleDelete(p: ClosedPosition) {
    if (!(await confirm({ message: `Permanently delete this ${p.ticker} ${p.type} record? This can't be undone.`, danger: true })))
      return;
    setDeleteError(null);
    setDeletingId(p.id);
    const supabase = createClient();
    const { error } = await deleteClosedPosition(supabase, p.source, p.id);
    setDeletingId(null);
    if (error) {
      setDeleteError(error === "forbidden" ? "Deleting closed positions requires a paid account." : error);
      return;
    }
    setPositions((prev) => prev.filter((row) => !(row.source === p.source && row.id === p.id)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-card-border bg-card-bg p-2">
        {(["all", ...CLOSED_POSITION_ACCOUNTS] as FilterValue[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "rounded-xl px-4 py-2 text-sm font-medium " +
              (filter === f
                ? "bg-white/10 text-text-primary"
                : "text-text-muted hover:bg-white/5 hover:text-text-primary")
            }
          >
            {f === "all" ? "All Accounts" : ACCOUNT_LABEL[f]}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-[#ff5c7a]">
          Could not load closed positions. Try refreshing.
        </div>
      )}

      {deleteError && <div className="text-sm text-[#ff5c7a]">{deleteError}</div>}

      {!loadError &&
        CLOSED_POSITION_ACCOUNTS.filter((acct) => filter === "all" || filter === acct).map((acct) => {
          const st = sortState[acct];
          const rawRows = byAccount[acct];
          const rows = st.key ? sortRows(rawRows, st.key, st.dir) : rawRows;
          return (
            <div key={acct} className="rounded-2xl border border-card-border bg-card-bg p-5">
              <h3 className="mb-4 text-sm font-semibold text-text-primary">{ACCOUNT_LABEL[acct]}</h3>
              {loading ? (
                <div className="text-sm text-text-muted">Loading…</div>
              ) : rows.length === 0 ? (
                <div className="text-sm text-text-muted">No closed positions in this account yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                        {HEAD_CELLS.map((cell) => (
                          <th
                            key={cell.key}
                            onClick={() => toggleSort(acct, cell.key)}
                            className={
                              "cursor-pointer select-none whitespace-nowrap py-2 pr-4 hover:text-text-primary" +
                              (cell.numeric ? " text-right" : "") +
                              (st.key === cell.key ? " text-text-primary" : "")
                            }
                          >
                            {cell.label}
                            {st.key === cell.key ? (st.dir === 1 ? " ▲" : " ▼") : ""}
                          </th>
                        ))}
                        <th className="whitespace-nowrap py-2 pr-4">Status</th>
                        {canDelete && <th className="whitespace-nowrap py-2 pr-4">&nbsp;</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {rows.map((p) => (
                        <tr key={`${p.source}-${p.id}`}>
                          <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">
                            {p.ticker}
                          </td>
                          <td
                            className="whitespace-nowrap py-2.5 pr-4 font-semibold"
                            style={{ color: CLOSED_POSITION_TYPE_COLOR[p.type] }}
                          >
                            {p.type}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                            {money(p.strike)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                            {money(p.premCost)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                            {p.contracts}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-right">
                            <PctCell pct={p.returnPct} />
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">
                            {fmtDate(p.closeDate)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">
                            {fmtDate(p.entryDate)}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-text-muted">
                            {statusLabel(p)}
                          </td>
                          {canDelete && (
                            <td className="whitespace-nowrap py-2.5 pr-4 text-right">
                              <button
                                type="button"
                                disabled={deletingId === p.id}
                                onClick={() => handleDelete(p)}
                                className="text-xs font-medium text-[#ff5c7a] hover:underline disabled:opacity-50"
                              >
                                {deletingId === p.id ? "Deleting…" : "Delete"}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

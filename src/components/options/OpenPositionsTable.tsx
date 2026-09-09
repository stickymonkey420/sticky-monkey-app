"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  daysToExpiration,
  fetchCostBasis,
  fetchLeapPositions,
  fetchOpenWheelTrades,
  fetchRollChainHistory,
  fmtDate,
  money,
  normalizeOpenPositions,
} from "@/lib/options/queries";
import { fetchQuote } from "@/lib/options/priceQuotes";
import {
  deleteTrade,
  editTrade,
  markStatus,
  rollTrade,
  closeToClose,
  type TradeFormInput,
} from "@/lib/options/mutations";
import type { AccountTypeOption, OpenPosition, OpenPositionKind } from "@/lib/options/types";
import AddEditTradeModal from "./AddEditTradeModal";
import RollPositionModal from "./RollPositionModal";
import CloseToCloseModal from "./CloseToCloseModal";
import MarkStatusSelect from "./MarkStatusSelect";

type OpenPositionsTableProps = {
  accountType: string | null;
  accountOptions: AccountTypeOption[];
  refreshKey?: number;
  onChanged?: () => void;
};

const TYPE_COLOR: Record<OpenPositionKind, string> = {
  CSP: "#4f8cff", // --accent-blue
  CC: "#34c9c9", // --accent-teal
  LEAP: "#a06bff", // --accent-purple
};

function dteColor(dte: number | null): string | undefined {
  if (dte === null) return undefined;
  if (dte < 0) return "#ff5c7a"; // --accent-red -- past expiration, not yet marked closed
  if (dte <= 7) return "#ffb648"; // --accent-orange -- expiring soon
  return undefined;
}

const ACTION_BTN_CLASS = "rounded-md border border-[#2a2f3f] px-2 py-1 text-xs text-text-primary hover:bg-white/5";

// Open Positions table -- read side ported from the wheel_trades
// (status=open) + leap_positions rows rendered by rowHtml()/
// renderPositions() in the live Webflow page's script; write side (Edit,
// Delete, Mark as..., Roll) added in this increment, wired to
// lib/options/mutations.ts. Project doc:
// `claude/roll-positions-options-script.html`.
export default function OpenPositionsTable({
  accountType,
  accountOptions,
  refreshKey = 0,
  onChanged,
}: OpenPositionsTableProps) {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingPosition, setEditingPosition] = useState<OpenPosition | null>(null);
  const [rollingPosition, setRollingPosition] = useState<OpenPosition | null>(null);
  const [closingPosition, setClosingPosition] = useState<OpenPosition | null>(null);
  // Bumped by afterMutation() below so this table always reloads its own
  // rows after a row-level mutation, independent of whether the parent
  // also passed an `onChanged` (which only needs to reload the sibling
  // PremiumSummaryCards).
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      if (!accountType) {
        if (!cancelled) {
          setPositions([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setUserId(null);
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setUserId(user.id);

      const [wheelRows, leapRows] = await Promise.all([
        fetchOpenWheelTrades(supabase, user.id, accountType),
        fetchLeapPositions(supabase, user.id, accountType),
      ]);
      if (cancelled) return;
      setPositions(normalizeOpenPositions(wheelRows, leapRows));
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

  async function handleDelete(p: OpenPosition) {
    if (!window.confirm("Remove this position? This cannot be undone.")) return;
    setActionError(null);
    const supabase = createClient();
    const { error } = await deleteTrade(supabase, p.source, p.id);
    if (error) {
      setActionError("Could not remove position. Try again.");
      return;
    }
    afterMutation();
  }

  async function handleMarkExpired(p: OpenPosition) {
    if (!window.confirm('Mark this position as "Expired worthless"? It will move out of Open Positions.')) return;
    if (!userId) return;
    setActionError(null);
    const supabase = createClient();
    const { error } = await markStatus(
      supabase,
      userId,
      { id: p.id, ticker: p.ticker, accountType: p.accountType, type: p.type as "CSP" | "CC", contracts: p.contracts, strike: p.strike, premium: p.premium },
      "expired"
    );
    if (error) {
      setActionError("Could not update position status. Try again.");
      return;
    }
    afterMutation();
  }

  async function handleMarkAssigned(p: OpenPosition) {
    const isCSP = p.type === "CSP";
    const shareQty = 100 * (Number(p.contracts) || 0);
    const label = isCSP ? "Assigned" : "Called away";
    const detail = isCSP
      ? ` This will add ${shareQty} shares of ${p.ticker} to your holdings at an effective cost basis of $${(
          Number(p.strike) - Number(p.premium || 0)
        ).toFixed(2)}/sh (strike minus premium).`
      : ` This will remove ${shareQty} shares of ${p.ticker} from your holdings.`;
    if (!window.confirm(`Mark this position as "${label}"?${detail}`)) return;
    if (!userId) return;
    setActionError(null);
    const supabase = createClient();
    const { error } = await markStatus(
      supabase,
      userId,
      { id: p.id, ticker: p.ticker, accountType: p.accountType, type: p.type as "CSP" | "CC", contracts: p.contracts, strike: p.strike, premium: p.premium },
      "assigned"
    );
    if (error) {
      setActionError("Could not update position status. Try again.");
      return;
    }
    afterMutation();
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Open Positions</h3>
      {actionError && <div className="mb-3 text-xs text-[#ff5c7a]">{actionError}</div>}
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : positions.length === 0 ? (
        <div className="text-sm text-text-muted">No open positions in this account.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-medium uppercase text-text-muted">
                <th className="whitespace-nowrap py-2 pr-4">Ticker</th>
                <th className="whitespace-nowrap py-2 pr-4">Type</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">Strike</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">Premium</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">Contracts</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">Return %</th>
                <th className="whitespace-nowrap py-2 pr-4 text-right">DTE</th>
                <th className="whitespace-nowrap py-2 pr-4">Entry Date</th>
                <th className="whitespace-nowrap py-2 pr-4">Mark as...</th>
                <th className="whitespace-nowrap py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {positions.map((p) => {
                const dte = daysToExpiration(p.expiration);
                return (
                  <tr key={`${p.source}-${p.id}`}>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-text-primary">
                      {p.ticker}
                      {p.originTradeId && (
                        <span
                          title="Part of a roll chain -- this position was rolled from an earlier strike/expiration"
                          style={{ color: "#a06bff" }}
                          className="ml-1 align-super text-xs"
                        >
                          ↻
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 font-semibold" style={{ color: TYPE_COLOR[p.type] }}>
                      {p.type}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{money(p.strike)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{money(p.premium)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">{p.contracts}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right">
                      {p.returnPct === null ? (
                        <span className="text-text-muted">—</span>
                      ) : (
                        <span style={{ color: "#3ddc97" }}>{p.returnPct.toFixed(2)}%</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right" style={{ color: dteColor(dte) }}>
                      {dte === null ? <span className="text-text-muted">—</span> : dte}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-text-muted">{fmtDate(p.entryDate)}</td>
                    <td className="py-2.5 pr-4" style={{ minWidth: 160 }}>
                      <MarkStatusSelect
                        position={p}
                        onExpired={() => handleMarkExpired(p)}
                        onAssigned={() => handleMarkAssigned(p)}
                        onBoughtToClose={() => setClosingPosition(p)}
                        onRoll={() => setRollingPosition(p)}
                      />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4">
                      <div className="flex gap-1.5">
                        <button type="button" className={ACTION_BTN_CLASS} onClick={() => setEditingPosition(p)}>
                          Edit
                        </button>
                        <button type="button" className={ACTION_BTN_CLASS} onClick={() => handleDelete(p)}>
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingPosition && (
        <AddEditTradeModal
          mode="edit"
          position={editingPosition}
          accountOptions={accountOptions}
          defaultAccountType={editingPosition.accountType}
          onClose={() => setEditingPosition(null)}
          onSaved={afterMutation}
          onSubmit={async (input: TradeFormInput) => {
            const supabase = createClient();
            return editTrade(supabase, editingPosition.source, editingPosition.id, input);
          }}
          lookupCostBasis={async (ticker, acct) => {
            if (!userId) return null;
            const supabase = createClient();
            return fetchCostBasis(supabase, userId, ticker, acct);
          }}
        />
      )}

      {rollingPosition && (
        <RollPositionModal
          position={rollingPosition}
          onClose={() => setRollingPosition(null)}
          onSaved={afterMutation}
          onSubmit={async (input) => {
            if (!userId) return { error: "not_signed_in" };
            const supabase = createClient();
            return rollTrade(
              supabase,
              userId,
              {
                id: rollingPosition.id,
                ticker: rollingPosition.ticker,
                type: rollingPosition.type as "CSP" | "CC",
                accountType: rollingPosition.accountType,
                strike: rollingPosition.strike,
                expiration: rollingPosition.expiration,
                notes: rollingPosition.notes,
                originTradeId: rollingPosition.originTradeId,
              },
              input
            );
          }}
          fetchQuote={async (ticker) => {
            const supabase = createClient();
            return fetchQuote(supabase, ticker);
          }}
          fetchChainHistory={async (originId) => {
            if (!userId) return [];
            const supabase = createClient();
            return fetchRollChainHistory(supabase, userId, originId);
          }}
        />
      )}

      {closingPosition && (
        <CloseToCloseModal
          position={closingPosition}
          onClose={() => setClosingPosition(null)}
          onSaved={afterMutation}
          onSubmit={async (costPerShare) => {
            const supabase = createClient();
            return closeToClose(supabase, closingPosition.id, costPerShare);
          }}
          fetchQuote={async (ticker) => {
            const supabase = createClient();
            return fetchQuote(supabase, ticker);
          }}
        />
      )}
    </div>
  );
}

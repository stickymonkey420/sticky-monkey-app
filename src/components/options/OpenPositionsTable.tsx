"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  daysToExpiration,
  fetchLeapPositions,
  fetchOpenWheelTrades,
  fmtDate,
  money,
  normalizeOpenPositions,
} from "@/lib/options/queries";
import type { OpenPosition, OpenPositionKind } from "@/lib/options/types";

type OpenPositionsTableProps = {
  accountType: string | null;
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

// Read-only Open Positions table for one account -- ported from the
// wheel_trades (status=open) + leap_positions rows rendered by rowHtml()/
// renderPositions() in the live Webflow page's script. Mark-as-status,
// Edit, Del, Roll and Buy-to-Close controls from that script are mutations
// and are intentionally NOT included in this read-only increment.
export default function OpenPositionsTable({ accountType }: OpenPositionsTableProps) {
  const [positions, setPositions] = useState<OpenPosition[]>([]);
  const [loading, setLoading] = useState(true);

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
        if (!cancelled) setLoading(false);
        return;
      }

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
  }, [accountType]);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Open Positions</h3>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : positions.length === 0 ? (
        <div className="text-sm text-text-muted">No open positions in this account.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
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
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {money(p.strike)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {money(p.premium)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right text-text-primary">
                      {p.contracts}
                    </td>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

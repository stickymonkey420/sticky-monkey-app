import { BOARD_SEAT_LIMIT, INVESTOR_POOL_PCT } from "@/lib/investors/types";
import { fmtPct } from "@/lib/investors/calc";
import type { PoolSummary } from "@/lib/investors/calc";

// App Director-only. Mirrors check_cap_table_limits()'s own numbers (see
// lib/investors/calc.ts) -- read-only, the trigger is what actually
// enforces these caps.
export default function PoolSummaryCards({ summary }: { summary: PoolSummary }) {
  const tiles = [
    { label: "Total Confirmed Equity", value: fmtPct(summary.totalConfirmedEquityPct) },
    { label: "Pool Used", value: `${fmtPct(summary.poolUsedPct)} of ${INVESTOR_POOL_PCT}%` },
    { label: "Pool Remaining", value: fmtPct(summary.poolRemainingPct) },
    { label: "Board Seats", value: `${summary.boardSeatsUsed} / ${BOARD_SEAT_LIMIT}` },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-card-border bg-card-bg p-4">
          <div className="mb-1 text-xs text-text-muted">{t.label}</div>
          <div className="text-lg font-semibold text-text-primary">{t.value}</div>
        </div>
      ))}
    </div>
  );
}

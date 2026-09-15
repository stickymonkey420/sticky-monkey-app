import type { DonutSlice } from "@/lib/gameAfi/allocationCalc";

// Track color shared with the Dashboard's Expense Categories rings
// (lib/dashboard/expenseCategories.ts RING_TRACK_COLOR) -- the one neutral
// "empty portion" color this app already uses behind a colored fill.
const TRACK_COLOR = "rgba(89, 99, 128, 0.35)";
// A slice with a real but tiny share still renders as a visible sliver
// rather than an invisible hairline.
const MIN_BAR_PCT = 2;

// Industry Concentration's chart, per your call to swap the donut for a
// horizontal bar list: one row per industry, full descriptive name on its
// own line (no cramped legend column to wrap awkwardly), a thin colored
// bar sized to that industry's share of the match's holdings, then the
// dollar value and percentage underneath. Same {name, value, color} slices
// groupHoldingsByIndustry already builds (fixed categorical palette, top-N
// then "Other" -- see lib/gameAfi/allocationCalc.ts) -- only the rendering
// differs from the Allocation donut, not the underlying data shape.
export default function IndustryBarChart({
  title,
  slices,
  total,
  loading,
  emptyLabel,
  formatValue,
}: {
  title: string;
  slices: DonutSlice[];
  total: number;
  loading: boolean;
  emptyLabel: string;
  formatValue: (n: number) => string;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{title}</h3>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : slices.length === 0 ? (
        <div className="text-sm text-text-muted">{emptyLabel}</div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-4">
          {slices.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <div key={s.name}>
                <div className="mb-1.5 text-sm text-text-primary">{s.name}</div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: TRACK_COLOR }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(pct, MIN_BAR_PCT)}%`, backgroundColor: s.color }}
                  />
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {formatValue(s.value)} ({pct.toFixed(0)}%)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

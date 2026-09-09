import { money } from "@/lib/options/queries";
import type { DonutSlice } from "@/lib/invest/calc";

type PortfolioDonutCardProps = {
  title: string;
  slices: DonutSlice[];
  total: number;
  loading: boolean;
  emptyLabel: string;
};

// One reusable donut card, parameterized by title/slices/total so it
// renders for every Invest page bucket (Brokerage, Traditional IRA, Roth
// IRA, Crypto, Metals) from the same markup. Purely presentational -- the
// parent (invest/page.tsx) owns fetching positions/metal_holdings once and
// grouping them per bucket via lib/invest/calc.ts, the same
// fetch-once-in-the-parent split AccountTabs uses for Options' tab list.
//
// Donut rendering is copied 1:1 from the Dashboard's Asset Allocation card
// (src/components/dashboard/NetWorthCard.tsx): a plain CSS conic-gradient
// circle with an absolutely-centered total, not a canvas/SVG chart library,
// so this page's donuts look identical to the Dashboard's.
export default function PortfolioDonutCard({ title, slices, total, loading, emptyLabel }: PortfolioDonutCardProps) {
  let gradient = "none";
  if (slices.length && total > 0) {
    const parts: string[] = [];
    let cursor = 0;
    slices.forEach((s) => {
      const pct = (s.value / total) * 100;
      const start = cursor;
      const end = cursor + pct;
      parts.push(`${s.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
      cursor = end;
    });
    gradient = `conic-gradient(${parts.join(", ")})`;
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{title}</h3>
      <div className="flex flex-1 items-center gap-6">
        <div className="relative h-24 w-24 shrink-0">
          <div className="h-24 w-24 rounded-full" style={{ backgroundImage: gradient }} />
          <div
            className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full p-1.5 text-center text-xs font-medium text-text-primary"
            style={{ backgroundColor: "hsla(221.05, 31.15%, 11.96%, 0.92)" }}
          >
            {loading ? "…" : money(total)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="text-sm text-text-muted">Loading…</div>
          ) : slices.length === 0 ? (
            <div className="text-sm text-text-muted">{emptyLabel}</div>
          ) : (
            slices.map((s) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              return (
                <div key={s.name} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="truncate text-sm text-text-primary">{s.name}</span>
                  </div>
                  <div className="shrink-0 text-sm text-text-muted">
                    {money(s.value)} ({pct.toFixed(0)}%)
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

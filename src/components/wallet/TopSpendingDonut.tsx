import { money } from "@/lib/options/queries";
import type { TopSpendingResult } from "@/lib/wallet/calc";

type TopSpendingDonutProps = {
  data: TopSpendingResult;
  loading: boolean;
};

// Same conic-gradient donut card as Invest's PortfolioDonutCard, but the
// center shows the leading account's SHARE of spend (matching the live
// page's "us-center-pct" element) instead of a dollar total -- this card
// is about concentration ("how much of my spending is one account"), not
// a portfolio's total value.
export default function TopSpendingDonut({ data, loading }: TopSpendingDonutProps) {
  const { slices } = data;
  const total = slices.reduce((s, x) => s + x.value, 0);

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
      <h3 className="mb-4 text-lg font-semibold text-text-primary">Top Spending by Account</h3>
      <div className="flex flex-1 items-center gap-6">
        <div className="relative h-24 w-24 shrink-0">
          <div
            className="h-24 w-24 rounded-full"
            style={{ backgroundColor: "hsla(224.6,17.97%,42.55%,0.15)", backgroundImage: gradient }}
          />
          <div
            className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full p-1.5 text-center text-xs font-medium text-text-primary"
            style={{ backgroundColor: "hsla(221.05, 31.15%, 11.96%, 0.92)" }}
          >
            {loading ? "…" : `${Math.round(total > 0 ? (slices[0]?.value ?? 0) / total * 100 : 0)}%`}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="text-sm text-text-muted">Loading…</div>
          ) : slices.length === 0 ? (
            <div className="text-sm text-text-muted">No spending yet.</div>
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

import { money } from "@/lib/options/queries";
import type { DonutSlice } from "@/lib/invest/calc";

type PortfolioDonutCardProps = {
  title: string;
  slices: DonutSlice[];
  total: number;
  loading: boolean;
  emptyLabel: string;
  // Optional id passthrough -- used by invest/page.tsx to tag the Brokerage
  // instance as "eq-brokerage-card" for the Abu chatbot's card-highlight
  // feature (see components/chat/AbuChatWidget.tsx). Every other bucket
  // renders without one.
  id?: string;
  // Defaults to the shared `money()` helper (always 2 decimals, matches
  // every Invest page donut). Game-a-Fi's Overview page passes
  // gameAfi/format's formatMoney instead, which rounds to whole dollars --
  // per your call that "$619,633.00" reads noisier than "$619,633" on a
  // portfolio-sized number.
  formatValue?: (n: number) => string;
  // When set, each legend swatch becomes clickable, opening the browser's
  // native color picker (a plain <input type="color">, no extra library)
  // for that row; called with the row's name and the chosen hex color.
  // Undefined leaves every swatch a static, non-interactive dot -- the
  // Invest page's donuts don't pass this and are unaffected.
  onColorChange?: (name: string, color: string) => void;
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
export default function PortfolioDonutCard({
  title,
  slices,
  total,
  loading,
  emptyLabel,
  id,
  formatValue = money,
  onColorChange,
}: PortfolioDonutCardProps) {
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
    <div id={id} className="flex h-full flex-col rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-center text-sm font-semibold text-text-primary">{title}</h3>
      {/* Donut centered on top, full-width key below it -- stacked instead of
          side-by-side so the legend gets the card's whole width to itself
          and ticker names stop getting clipped in a narrow shared column. */}
      <div className="flex flex-1 flex-col items-center gap-5">
        <div className="relative h-24 w-24 shrink-0">
          <div className="h-24 w-24 rounded-full" style={{ backgroundImage: gradient }} />
          <div
            className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full p-1.5 text-center text-xs font-medium text-text-primary"
            style={{ backgroundColor: "hsla(221.05, 31.15%, 11.96%, 0.92)" }}
          >
            {loading ? "…" : formatValue(total)}
          </div>
        </div>
        <div className="w-full min-w-0">
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
                    {onColorChange ? (
                      <label
                        className="relative inline-block h-2.5 w-2.5 shrink-0 cursor-pointer rounded-full ring-offset-2 ring-offset-card-bg hover:ring-2 hover:ring-white/40"
                        style={{ backgroundColor: s.color }}
                        title={`Change ${s.name} color`}
                      >
                        <input
                          type="color"
                          value={s.color}
                          onChange={(e) => onColorChange(s.name, e.target.value)}
                          aria-label={`Change ${s.name} color`}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </label>
                    ) : (
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                    )}
                    <span className="min-w-0 break-words text-base text-text-primary">{s.name}</span>
                  </div>
                  <div className="shrink-0 text-base text-text-muted">
                    {formatValue(s.value)} ({pct.toFixed(0)}%)
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

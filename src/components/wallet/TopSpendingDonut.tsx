import { money } from "@/lib/options/queries";
import type { TopSpendingResult } from "@/lib/wallet/calc";

type TopSpendingDonutProps = {
  data: TopSpendingResult;
  loading: boolean;
};

// SVG ring donut: thin stroke, small gaps between segments, solid center.
// Compact layout. Center shows the leading account's SHARE of spend -- this
// card is about concentration ("how much of my spending is one account").
const SIZE = 64;
const STROKE = 7;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GAP = 2; // px of arc between segments

export default function TopSpendingDonut({ data, loading }: TopSpendingDonutProps) {
  const { slices } = data;
  const total = slices.reduce((s, x) => s + x.value, 0);
  const drawn = slices.filter((s) => s.value > 0);
  const gap = drawn.length > 1 ? GAP : 0;

  let offset = 0;
  const arcs = total > 0
    ? drawn.map((s) => {
        const len = (s.value / total) * C;
        const arc = {
          key: s.name,
          color: s.color,
          dash: `${Math.max(len - gap, 0.5)} ${C}`,
          offset: -offset,
          title: `${s.name}: ${money(s.value)} (${((s.value / total) * 100).toFixed(0)}%)`,
        };
        offset += len;
        return arc;
      })
    : [];

  const lead = slices[0];
  const leadPct = total > 0 && lead ? Math.round((lead.value / total) * 100) : 0;

  return (
    <div className="flex flex-col rounded-2xl border border-card-border bg-card-bg px-5 py-4">
      <h3 className="mb-2 text-base font-semibold text-text-primary">Top Spending by Account</h3>
      <div className="flex items-center gap-5">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="hsla(224.6,17.97%,42.55%,0.18)"
              strokeWidth={STROKE}
            />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={STROKE}
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
                className="transition-opacity hover:opacity-80"
              >
                <title>{a.title}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-center">
            {loading ? (
              <span className="text-sm text-text-muted">…</span>
            ) : total > 0 && lead ? (
              <span className="text-sm font-semibold text-text-primary" title={lead.name}>{leadPct}%</span>
            ) : (
              <span className="text-xs text-text-muted">—</span>
            )}
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
                <div key={s.name} className="flex items-center justify-between gap-3 py-0.5">
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

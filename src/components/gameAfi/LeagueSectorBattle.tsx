import type { SectorBattleRow } from "@/lib/gameAfi/leagueCalc";
import { formatPct } from "@/lib/gameAfi/leagueCalc";

// League-wide average return by sector (across every drafted position,
// not per-manager), with a long/short count -- the reference site's
// "Sector Battle".
export default function LeagueSectorBattle({ rows }: { rows: SectorBattleRow[] }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.avgReturnPct)));

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">Sector Battle</h3>
      <p className="mb-4 text-xs text-text-muted">avg return · long/short</p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => {
          const positive = r.avgReturnPct >= 0;
          const widthPct = (Math.abs(r.avgReturnPct) / maxAbs) * 100;
          return (
            <div key={r.sector} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-xs text-text-primary">{r.sector}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPct}%`, backgroundColor: positive ? "#3ddc97" : "#ff5c7a" }}
                />
              </div>
              <span
                className="w-16 shrink-0 text-right text-xs font-semibold"
                style={{ color: positive ? "#3ddc97" : "#ff5c7a" }}
              >
                {formatPct(r.avgReturnPct, 1)}
              </span>
              <span className="w-14 shrink-0 text-right text-[10px] text-text-muted">
                {r.longCount}L/{r.shortCount}S
              </span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-text-muted">No positions drafted yet.</p>}
      </div>
    </div>
  );
}

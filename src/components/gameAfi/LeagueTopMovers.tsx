import type { LeaguePositionRow } from "@/lib/gameAfi/leagueTypes";
import { formatPct } from "@/lib/gameAfi/leagueCalc";

function MoverRow({ p, color }: { p: LeaguePositionRow; color: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-sm last:border-0">
      <div>
        <span className="font-medium text-text-primary">{p.ticker}</span>
        <span className="ml-2 text-xs uppercase text-text-muted">{p.side}</span>
        <span className="ml-2 text-xs text-text-muted">{p.name}</span>
      </div>
      <span className="font-semibold" style={{ color }}>
        {formatPct(p.returnPct)}
      </span>
    </div>
  );
}

// Best/worst individual drafted positions leaguewide -- the reference
// site's "Top Gainers" / "Biggest Losers".
export default function LeagueTopMovers({
  gainers,
  losers,
}: {
  gainers: LeaguePositionRow[];
  losers: LeaguePositionRow[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Top Gainers</h3>
        {gainers.length === 0 && <p className="text-sm text-text-muted">No positions yet.</p>}
        {gainers.map((p) => (
          <MoverRow key={`${p.userId}-${p.ticker}`} p={p} color="#3ddc97" />
        ))}
      </div>
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Biggest Losers</h3>
        {losers.length === 0 && <p className="text-sm text-text-muted">No positions yet.</p>}
        {losers.map((p) => (
          <MoverRow key={`${p.userId}-${p.ticker}`} p={p} color="#ff5c7a" />
        ))}
      </div>
    </div>
  );
}

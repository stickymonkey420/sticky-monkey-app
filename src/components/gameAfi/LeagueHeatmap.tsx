import type { ManagerStanding } from "@/lib/gameAfi/leagueCalc";
import { buildHeatmap, formatPct } from "@/lib/gameAfi/leagueCalc";

// Manager x draft-round grid, each cell colored by that position's return
// -- the reference site's "League Heatmap", showing at a glance where a
// manager's return is concentrated (a big green square carrying an
// otherwise red roster, etc).
export default function LeagueHeatmap({ standings, rosterSize }: { standings: ManagerStanding[]; rosterSize: number }) {
  const rows = buildHeatmap(standings, rosterSize);
  const rounds = Array.from({ length: rosterSize }, (_, i) => i + 1);

  function cellColor(returnPct: number | null): string {
    if (returnPct === null) return "rgba(255,255,255,0.03)";
    const clamped = Math.max(-50, Math.min(50, returnPct));
    if (clamped >= 0) {
      const alpha = 0.12 + (clamped / 50) * 0.55;
      return `rgba(61,220,151,${alpha})`;
    }
    const alpha = 0.12 + (-clamped / 50) * 0.55;
    return `rgba(255,92,122,${alpha})`;
  }

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-1 text-sm font-semibold text-text-primary">League Heatmap</h3>
      <p className="mb-4 text-xs text-text-muted">return by draft slot</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="text-left text-text-muted"> </th>
              {rounds.map((r) => (
                <th key={r} className="px-1 text-center font-medium text-text-muted">
                  {r}
                </th>
              ))}
              <th className="px-1 text-center font-medium text-text-muted">AVG</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((m, i) => (
              <tr key={m.userId}>
                <td className="whitespace-nowrap pr-2 text-text-primary">{m.name}</td>
                {rows[i].map((cell, ri) => (
                  <td
                    key={ri}
                    title={cell ? `${cell.ticker} ${formatPct(cell.returnPct)}` : "no pick"}
                    className="min-w-[34px] rounded px-1 py-1.5 text-center font-medium text-text-primary"
                    style={{ backgroundColor: cellColor(cell?.returnPct ?? null) }}
                  >
                    {cell ? Math.round(cell.returnPct) : ""}
                  </td>
                ))}
                <td
                  className="min-w-[44px] rounded px-1 py-1.5 text-center font-semibold"
                  style={{ color: m.avgReturnPct >= 0 ? "#3ddc97" : "#ff5c7a" }}
                >
                  {formatPct(m.avgReturnPct, 1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

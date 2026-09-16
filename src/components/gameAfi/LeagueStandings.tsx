import type { ManagerStanding } from "@/lib/gameAfi/leagueCalc";
import { computeSummaryTiles, formatPct } from "@/lib/gameAfi/leagueCalc";
import PreviewStat from "./PreviewStat";

// League Avg / Leader / 1st-to-last Spread / Best Position / In The Green
// tiles, plus the ranked manager list -- the top-line summary a league
// page opens with.
export default function LeagueStandings({ standings }: { standings: ManagerStanding[] }) {
  const tiles = computeSummaryTiles(standings);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg p-5">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">Standings</h3>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <PreviewStat label="League Avg" value={formatPct(tiles.leagueAvgPct)} sub="mean of all managers" />
        <PreviewStat
          label="Leader"
          value={tiles.leader ? formatPct(tiles.leader.avgReturnPct) : "--"}
          color="#3ddc97"
          sub={tiles.leader?.name}
        />
        <PreviewStat label="1st -> Last Spread" value={formatPct(tiles.spreadPct)} sub="gap to bottom" color="#f5d020" />
        <PreviewStat
          label="Best Position"
          value={tiles.bestPosition ? formatPct(tiles.bestPosition.returnPct) : "--"}
          color="#3ddc97"
          sub={tiles.bestPosition ? `${tiles.bestPosition.ticker} · ${tiles.bestPosition.name}` : undefined}
        />
        <PreviewStat
          label="In The Green"
          value={`${tiles.inTheGreenCount}/${tiles.managerCount}`}
          sub={tiles.worstPosition ? `worst ${formatPct(tiles.worstPosition.returnPct)} · ${tiles.worstPosition.name}` : undefined}
        />
      </div>

      <ol className="flex flex-col gap-1">
        {standings.map((m, i) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <span className="w-5 text-xs text-text-muted">{i === 0 ? "♛" : i + 1}</span>
              <div>
                <span className="text-sm font-medium text-text-primary">{m.name}</span>
                <span className="ml-2 text-xs text-text-muted">seed #{m.seed}</span>
              </div>
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: m.avgReturnPct >= 0 ? "#3ddc97" : "#ff5c7a" }}
            >
              {formatPct(m.avgReturnPct)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

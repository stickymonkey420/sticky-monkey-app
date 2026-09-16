import type { LeaguePositionRow } from "./leagueTypes";

// Signed percent, e.g. "+7.10%" / "-11.33%" -- shared by every League
// component so the sign convention stays identical everywhere.
export function formatPct(n: number, decimals = 2): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

export type ManagerStanding = {
  userId: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  seed: number;
  avgReturnPct: number;
  positions: LeaguePositionRow[];
};

// Equal-weight average return across a manager's positions -- a straight
// average of each position's % return, not weighted by position size
// (matching the reference site's "Equal-weight average return across N
// positions per manager" scoring). A manager with zero picks yet gets a
// standings row at 0% rather than being dropped.
export function computeStandings(positions: LeaguePositionRow[]): ManagerStanding[] {
  const byUser = new Map<string, ManagerStanding>();
  for (const p of positions) {
    let entry = byUser.get(p.userId);
    if (!entry) {
      entry = {
        userId: p.userId,
        username: p.username,
        name: p.name,
        avatarUrl: p.avatarUrl,
        seed: p.seed,
        avgReturnPct: 0,
        positions: [],
      };
      byUser.set(p.userId, entry);
    }
    if (p.ticker) entry.positions.push(p);
  }
  for (const entry of byUser.values()) {
    entry.avgReturnPct =
      entry.positions.length === 0
        ? 0
        : entry.positions.reduce((sum, p) => sum + p.returnPct, 0) / entry.positions.length;
  }
  return Array.from(byUser.values()).sort((a, b) => b.avgReturnPct - a.avgReturnPct);
}

export type LeagueSummaryTiles = {
  leagueAvgPct: number;
  leader: ManagerStanding | null;
  spreadPct: number;
  bestPosition: LeaguePositionRow | null;
  worstPosition: LeaguePositionRow | null;
  inTheGreenCount: number;
  managerCount: number;
};

export function computeSummaryTiles(standings: ManagerStanding[]): LeagueSummaryTiles {
  const managerCount = standings.length;
  const leagueAvgPct = managerCount === 0 ? 0 : standings.reduce((s, m) => s + m.avgReturnPct, 0) / managerCount;
  const leader = standings[0] ?? null;
  const last = standings[standings.length - 1] ?? null;
  const spreadPct = leader && last ? leader.avgReturnPct - last.avgReturnPct : 0;
  const allPositions = standings.flatMap((m) => m.positions);
  let bestPosition: LeaguePositionRow | null = null;
  let worstPosition: LeaguePositionRow | null = null;
  for (const p of allPositions) {
    if (!bestPosition || p.returnPct > bestPosition.returnPct) bestPosition = p;
    if (!worstPosition || p.returnPct < worstPosition.returnPct) worstPosition = p;
  }
  const inTheGreenCount = standings.filter((m) => m.avgReturnPct > 0).length;
  return { leagueAvgPct, leader, spreadPct, bestPosition, worstPosition, inTheGreenCount, managerCount };
}

export type SectorBattleRow = {
  sector: string;
  avgReturnPct: number;
  longCount: number;
  shortCount: number;
};

// League-wide average return by sector, across every drafted position
// (not per-manager) -- mirrors the reference site's "Sector Battle".
export function computeSectorBattle(positions: LeaguePositionRow[]): SectorBattleRow[] {
  const bySector = new Map<string, { sum: number; count: number; longCount: number; shortCount: number }>();
  for (const p of positions) {
    if (!p.ticker || !p.sector) continue;
    let entry = bySector.get(p.sector);
    if (!entry) {
      entry = { sum: 0, count: 0, longCount: 0, shortCount: 0 };
      bySector.set(p.sector, entry);
    }
    entry.sum += p.returnPct;
    entry.count += 1;
    if (p.side === "long") entry.longCount += 1;
    else if (p.side === "short") entry.shortCount += 1;
  }
  return Array.from(bySector.entries())
    .map(([sector, e]) => ({
      sector,
      avgReturnPct: e.count === 0 ? 0 : e.sum / e.count,
      longCount: e.longCount,
      shortCount: e.shortCount,
    }))
    .sort((a, b) => b.avgReturnPct - a.avgReturnPct);
}

// Top N gainers/losers across every drafted position leaguewide.
export function computeTopMovers(
  positions: LeaguePositionRow[],
  n = 5
): { gainers: LeaguePositionRow[]; losers: LeaguePositionRow[] } {
  const withTickers = positions.filter((p) => p.ticker);
  const sorted = [...withTickers].sort((a, b) => b.returnPct - a.returnPct);
  return { gainers: sorted.slice(0, n), losers: sorted.slice(-n).reverse() };
}

// One cell per (manager, round) for the heatmap grid -- null where that
// manager hasn't picked in that round yet (roster still filling in, or
// draft in progress).
export function buildHeatmap(standings: ManagerStanding[], rosterSize: number): (LeaguePositionRow | null)[][] {
  return standings.map((m) => {
    const byRound = new Map(m.positions.map((p) => [p.round, p]));
    const row: (LeaguePositionRow | null)[] = [];
    for (let round = 1; round <= rosterSize; round++) {
      row.push(byRound.get(round) ?? null);
    }
    return row;
  });
}

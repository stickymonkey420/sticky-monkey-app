// Game-a-Fi Phase 1: a fantasy-football-style weekly standings board (not
// head-to-head) ranking members by real portfolio return %. Row shape
// matches the `game_afi_weekly_leaderboard` / `game_afi_season_leaderboard`
// SQL functions exactly -- both are SECURITY DEFINER and return only
// {user_id, display_name, pct_return, rank} so no member's raw dollar
// balance (net_worth_snapshots.total_balance) is ever exposed to anyone
// else, live account or not.
export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  pct_return: number;
  rank: number;
};

export type WeeklyLeaderboard = {
  weekStart: string | null; // ISO date (Monday), null when no week has a computable return yet
  rows: LeaderboardRow[];
};

export type SeasonLeaderboard = {
  seasonStart: string | null; // ISO date
  rows: LeaderboardRow[];
};

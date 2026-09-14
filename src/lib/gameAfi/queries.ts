import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeaderboardRow, SeasonLeaderboard, WeeklyLeaderboard } from "./types";

// Every call here hits a SECURITY DEFINER Postgres function (not a table
// select) -- that's what lets the leaderboard rank every member's real
// portfolio performance against each other without RLS on
// net_worth_snapshots exposing anyone's raw balance. See migration
// game_afi_leaderboard_phase1.

export async function fetchWeeklyLeaderboard(
  supabase: SupabaseClient,
  weekStart?: string | null
): Promise<WeeklyLeaderboard> {
  const { data, error } = await supabase.rpc("game_afi_weekly_leaderboard", {
    p_week_start: weekStart ?? null,
  });
  if (error) {
    console.error("fetchWeeklyLeaderboard failed", error);
    return { weekStart: null, rows: [] };
  }
  const rows = (data ?? []) as (LeaderboardRow & { week_start: string })[];
  return {
    weekStart: rows[0]?.week_start ?? weekStart ?? null,
    rows: rows.map(({ user_id, display_name, pct_return, rank }) => ({ user_id, display_name, pct_return, rank })),
  };
}

export async function fetchSeasonLeaderboard(
  supabase: SupabaseClient,
  seasonStart?: string | null
): Promise<SeasonLeaderboard> {
  const { data, error } = await supabase.rpc("game_afi_season_leaderboard", {
    p_season_start: seasonStart ?? null,
  });
  if (error) {
    console.error("fetchSeasonLeaderboard failed", error);
    return { seasonStart: null, rows: [] };
  }
  const rows = (data ?? []) as (LeaderboardRow & { season_start: string })[];
  return {
    seasonStart: rows[0]?.season_start ?? seasonStart ?? null,
    rows: rows.map(({ user_id, display_name, pct_return, rank }) => ({ user_id, display_name, pct_return, rank })),
  };
}

// Distinct weeks that have a computable return, newest first -- drives the
// week-picker dropdown.
export async function fetchAvailableWeeks(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.rpc("game_afi_available_weeks");
  if (error) {
    console.error("fetchAvailableWeeks failed", error);
    return [];
  }
  return ((data ?? []) as { week_start: string }[]).map((r) => r.week_start);
}

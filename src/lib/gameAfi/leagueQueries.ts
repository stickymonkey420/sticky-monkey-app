import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DraftPickRow,
  DraftPoolRow,
  LeagueMember,
  LeaguePositionRow,
  LeagueSnapshotRow,
  LeagueStatus,
  LeagueSummary,
  OnClock,
} from "./leagueTypes";

// Thin camelCase wrappers over the game_afi_league_* RPC functions
// (migration add_game_afi_league) -- all cross-member reads/writes go
// through these SECURITY DEFINER functions rather than direct table
// access, same convention as challengeQueries.ts/contractQueries.ts.

export async function fetchLeagues(supabase: SupabaseClient): Promise<LeagueSummary[]> {
  const { data, error } = await supabase.rpc("game_afi_league_list");
  if (error) {
    console.error("fetchLeagues failed", error);
    return [];
  }
  type Row = {
    id: string;
    name: string;
    status: LeagueStatus;
    roster_size: number;
    member_count: number;
    pick_count: number;
    total_picks: number;
    created_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    rosterSize: r.roster_size,
    memberCount: Number(r.member_count),
    pickCount: Number(r.pick_count),
    totalPicks: r.total_picks,
    createdAt: r.created_at,
  }));
}

export async function fetchLeagueMembers(supabase: SupabaseClient, leagueId: string): Promise<LeagueMember[]> {
  const { data, error } = await supabase.rpc("game_afi_league_members", { p_league_id: leagueId });
  if (error) {
    console.error("fetchLeagueMembers failed", error);
    return [];
  }
  type Row = { user_id: string; name: string; username: string | null; avatar_url: string | null; seed: number };
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id,
    name: r.name,
    username: r.username,
    avatarUrl: r.avatar_url,
    seed: r.seed,
  }));
}

export async function fetchOnClock(supabase: SupabaseClient, leagueId: string): Promise<OnClock | null> {
  const { data, error } = await supabase.rpc("game_afi_league_on_clock", { p_league_id: leagueId });
  if (error || !data || data.length === 0) return null;
  type Row = {
    user_id: string | null;
    name: string | null;
    username: string | null;
    round: number | null;
    seed: number | null;
    pick_number: number | null;
    drafting_done: boolean;
  };
  const r = data[0] as Row;
  if (r.drafting_done || !r.user_id) return null;
  return {
    userId: r.user_id,
    name: r.name ?? "",
    username: r.username,
    round: r.round ?? 0,
    seed: r.seed ?? 0,
    pickNumber: r.pick_number ?? 0,
    draftingDone: false,
  };
}

export async function fetchDraftPool(supabase: SupabaseClient, leagueId: string): Promise<DraftPoolRow[]> {
  const { data, error } = await supabase.rpc("game_afi_league_draft_pool", { p_league_id: leagueId });
  if (error) {
    console.error("fetchDraftPool failed", error);
    return [];
  }
  type Row = {
    ticker: string;
    company_name: string | null;
    sector: string | null;
    price: number | null;
    day_change_pct: number | null;
    drafted: boolean;
    drafted_by_username: string | null;
    drafted_side: "long" | "short" | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    ticker: r.ticker,
    companyName: r.company_name,
    sector: r.sector,
    price: r.price,
    dayChangePct: r.day_change_pct,
    drafted: r.drafted,
    draftedByUsername: r.drafted_by_username,
    draftedSide: r.drafted_side,
  }));
}

export async function fetchDraftPicks(supabase: SupabaseClient, leagueId: string): Promise<DraftPickRow[]> {
  const { data, error } = await supabase.rpc("game_afi_league_picks", { p_league_id: leagueId });
  if (error) {
    console.error("fetchDraftPicks failed", error);
    return [];
  }
  type Row = {
    pick_number: number;
    round: number;
    user_id: string;
    username: string | null;
    name: string;
    ticker: string;
    side: "long" | "short";
    price_at_pick: number;
    picked_at: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    pickNumber: r.pick_number,
    round: r.round,
    userId: r.user_id,
    username: r.username,
    name: r.name,
    ticker: r.ticker,
    side: r.side,
    priceAtPick: Number(r.price_at_pick),
    pickedAt: r.picked_at,
  }));
}

export async function fetchLeaguePositions(supabase: SupabaseClient, leagueId: string): Promise<LeaguePositionRow[]> {
  const { data, error } = await supabase.rpc("game_afi_league_positions", { p_league_id: leagueId });
  if (error) {
    console.error("fetchLeaguePositions failed", error);
    return [];
  }
  type Row = {
    user_id: string;
    username: string | null;
    name: string;
    avatar_url: string | null;
    seed: number;
    round: number | null;
    pick_number: number | null;
    ticker: string | null;
    side: "long" | "short" | null;
    sector: string | null;
    price_at_pick: number | null;
    current_price: number | null;
    return_pct: number;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    name: r.name,
    avatarUrl: r.avatar_url,
    seed: r.seed,
    round: r.round,
    pickNumber: r.pick_number,
    ticker: r.ticker,
    side: r.side,
    sector: r.sector,
    priceAtPick: r.price_at_pick === null ? null : Number(r.price_at_pick),
    currentPrice: r.current_price === null ? null : Number(r.current_price),
    returnPct: Number(r.return_pct),
  }));
}

export async function fetchLeagueSeasonSeries(supabase: SupabaseClient, leagueId: string): Promise<LeagueSnapshotRow[]> {
  const { data, error } = await supabase.rpc("game_afi_league_season_series", { p_league_id: leagueId });
  if (error) {
    console.error("fetchLeagueSeasonSeries failed", error);
    return [];
  }
  type Row = { user_id: string; username: string | null; snapshot_at: string; avg_return_pct: number };
  return ((data ?? []) as Row[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    snapshotAt: r.snapshot_at,
    avgReturnPct: Number(r.avg_return_pct),
  }));
}

export async function createLeague(
  supabase: SupabaseClient,
  name: string,
  rosterSize: number,
  handles: string[]
): Promise<{ ok: boolean; leagueId?: string; message: string }> {
  const { data, error } = await supabase.rpc("game_afi_league_create", {
    p_name: name,
    p_roster_size: rosterSize,
    p_handles: handles,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, leagueId: data as string, message: "League created." };
}

export async function startDraft(supabase: SupabaseClient, leagueId: string): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc("game_afi_league_start_draft", { p_league_id: leagueId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Draft started." };
}

export async function makePick(
  supabase: SupabaseClient,
  leagueId: string,
  userId: string,
  ticker: string,
  side: "long" | "short"
): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc("game_afi_league_make_pick", {
    p_league_id: leagueId,
    p_user_id: userId,
    p_ticker: ticker,
    p_side: side,
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Drafted ${ticker.toUpperCase()}.` };
}

export async function undoLastPick(supabase: SupabaseClient, leagueId: string): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.rpc("game_afi_league_undo_last_pick", { p_league_id: leagueId });
  if (error) return { ok: false, message: error.message };
  return { ok: true, message: "Last pick undone." };
}

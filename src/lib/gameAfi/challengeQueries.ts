import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChallengeRow, ChallengeStatus, MatchSummary } from "./challengeTypes";

// Every call here hits a SECURITY DEFINER Postgres function, never a raw
// table select/insert/update -- see the `add_game_afi_challenges`
// migration. That's what lets a regular member look up another member by
// handle, and see the other party's name/handle/avatar on a challenge row,
// despite profiles RLS otherwise restricting each member to their own row.

export type SendChallengeResult = { id: string | null; error: string | null };
export type ChallengeActionResult = { error: string | null };

// Strips Postgres/PostgREST's "function_name(args): " prefix so the raw
// `raise exception` message (e.g. "No member found with that handle") is
// what actually reaches the UI, instead of the wrapped error object.
function readableError(error: { message: string } | null): string | null {
  if (!error) return null;
  const match = error.message.match(/:\s*(.+)$/);
  return match ? match[1] : error.message;
}

export async function findHandle(
  supabase: SupabaseClient,
  handle: string
): Promise<{ id: string; name: string | null; username: string | null; avatar_url: string | null } | null> {
  const { data, error } = await supabase.rpc("game_afi_find_handle", { p_handle: handle }).maybeSingle();
  if (error || !data) return null;
  return data as { id: string; name: string | null; username: string | null; avatar_url: string | null };
}

export async function sendChallenge(
  supabase: SupabaseClient,
  handle: string,
  message: string | undefined,
  startingBalance: number,
  expiresAt: string | null,
  strategy: "shares" | "contracts" = "shares"
): Promise<SendChallengeResult> {
  const { data, error } = await supabase.rpc("game_afi_send_challenge", {
    p_handle: handle,
    p_message: message?.trim() || null,
    p_starting_balance: startingBalance,
    p_expires_at: expiresAt,
    p_strategy: strategy,
  });
  if (error) return { id: null, error: readableError(error) };
  return { id: data as string, error: null };
}

export async function respondToChallenge(
  supabase: SupabaseClient,
  challengeId: string,
  accept: boolean
): Promise<ChallengeActionResult> {
  const { error } = await supabase.rpc("game_afi_respond_to_challenge", {
    p_challenge_id: challengeId,
    p_accept: accept,
  });
  return { error: readableError(error) };
}

export async function cancelChallenge(supabase: SupabaseClient, challengeId: string): Promise<ChallengeActionResult> {
  const { error } = await supabase.rpc("game_afi_cancel_challenge", { p_challenge_id: challengeId });
  return { error: readableError(error) };
}

export async function fetchChallenges(supabase: SupabaseClient): Promise<ChallengeRow[]> {
  const { data, error } = await supabase.rpc("game_afi_list_challenges");
  if (error) {
    console.error("fetchChallenges failed", error);
    return [];
  }
  return (data ?? []) as ChallengeRow[];
}

// Both sides of one accepted head-to-head match, for the Overview page's
// "Head to Head" card -- see game_afi_match_summary. Returns null if the
// challenge isn't accepted or the caller isn't a participant (the RPC
// returns zero rows in that case rather than erroring).
export async function fetchMatchSummary(
  supabase: SupabaseClient,
  challengeId: string
): Promise<MatchSummary | null> {
  const { data, error } = await supabase
    .rpc("game_afi_match_summary", { p_challenge_id: challengeId })
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchMatchSummary failed", error);
    return null;
  }
  const row = data as {
    challenge_id: string;
    status: ChallengeStatus;
    starting_balance: number;
    expires_at: string | null;
    me_id: string;
    me_name: string | null;
    me_username: string | null;
    me_avatar_url: string | null;
    me_x_handle: string | null;
    me_cash_balance: number;
    me_holdings_value: number;
    me_total_value: number;
    opponent_id: string;
    opponent_name: string | null;
    opponent_username: string | null;
    opponent_avatar_url: string | null;
    opponent_x_handle: string | null;
    opponent_cash_balance: number;
    opponent_holdings_value: number;
    opponent_total_value: number;
  };
  return {
    challengeId: row.challenge_id,
    status: row.status,
    startingBalance: Number(row.starting_balance),
    expiresAt: row.expires_at,
    me: {
      id: row.me_id,
      name: row.me_name,
      username: row.me_username,
      avatarUrl: row.me_avatar_url,
      xHandle: row.me_x_handle,
      cashBalance: Number(row.me_cash_balance),
      holdingsValue: Number(row.me_holdings_value),
      totalValue: Number(row.me_total_value),
    },
    opponent: {
      id: row.opponent_id,
      name: row.opponent_name,
      username: row.opponent_username,
      avatarUrl: row.opponent_avatar_url,
      xHandle: row.opponent_x_handle,
      cashBalance: Number(row.opponent_cash_balance),
      holdingsValue: Number(row.opponent_holdings_value),
      totalValue: Number(row.opponent_total_value),
    },
  };
}

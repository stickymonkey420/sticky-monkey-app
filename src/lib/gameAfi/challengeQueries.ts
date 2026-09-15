import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChallengeRow } from "./challengeTypes";

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
  message?: string
): Promise<SendChallengeResult> {
  const { data, error } = await supabase.rpc("game_afi_send_challenge", {
    p_handle: handle,
    p_message: message?.trim() || null,
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClosedPosition } from "./types";

export type MutationResult = { error: string | null };

// Permanently deletes one closed-position record -- a `wheel_trades` row
// (source "wheel") or a `long_option_trades` row (source "long"). Both
// tables' DELETE policies require `auth.uid() = user_id` AND role IN
// ('paid','app_director') ("Paid users can delete own wheel trades" /
// "...own long option trades"), so a free user's row is never reachable
// here in the first place and a stray attempt comes back as Postgres
// error 42501 -- surfaced as "forbidden" rather than a raw DB message,
// same convention as src/lib/accounts/queries.ts deleteManualAccount.
export async function deleteClosedPosition(
  supabase: SupabaseClient,
  source: ClosedPosition["source"],
  id: string
): Promise<MutationResult> {
  const table = source === "long" ? "long_option_trades" : "wheel_trades";
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) return { error: error.code === "42501" ? "forbidden" : error.message };
  return { error: null };
}

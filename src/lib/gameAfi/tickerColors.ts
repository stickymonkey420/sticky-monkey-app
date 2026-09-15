import type { SupabaseClient } from "@supabase/supabase-js";

// Per-user color overrides for the Game-a-Fi Overview donut legends -- see
// the `add_game_afi_ticker_colors` migration. Direct table reads/writes
// (RLS: auth.uid() = user_id), same convention as paper_trades, since this
// is purely the signed-in member's own data -- no cross-user join needed.

export async function fetchTickerColorOverrides(supabase: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("game_afi_ticker_colors").select("name,color").eq("user_id", userId);
  const map = new Map<string, string>();
  if (error) {
    console.error("fetchTickerColorOverrides failed", error);
    return map;
  }
  for (const row of (data ?? []) as { name: string; color: string }[]) {
    map.set(row.name, row.color);
  }
  return map;
}

// Upserts one override -- `name` is the legend row's label (a ticker
// symbol, or "Cash"/"Other"), unique per user via the migration's
// unique(user_id, name) constraint.
export async function setTickerColorOverride(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  color: string
): Promise<boolean> {
  const { error } = await supabase
    .from("game_afi_ticker_colors")
    .upsert({ user_id: userId, name, color, updated_at: new Date().toISOString() }, { onConflict: "user_id,name" });
  if (error) {
    console.error("setTickerColorOverride failed", error);
    return false;
  }
  return true;
}

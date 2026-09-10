import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManualAccount } from "./types";

// Canonical fetch for `manual_accounts` -- both the Banking page and My
// Wallet (balance/spending calcs) import this instead of each querying
// the table themselves.
export async function fetchManualAccounts(
  supabase: SupabaseClient,
  userId: string
): Promise<ManualAccount[]> {
  const { data, error } = await supabase
    .from("manual_accounts")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    console.error("fetchManualAccounts failed", error);
    return [];
  }
  return (data ?? []) as ManualAccount[];
}

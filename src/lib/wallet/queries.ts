import type { SupabaseClient } from "@supabase/supabase-js";
import type { ManualAccount, PlaidTransaction } from "./types";

// Fetch functions for the My Wallet page, ported from the live Webflow
// page's two head-code scripts (project doc list didn't have a saved copy
// of this page's script the way Options/Holdings did -- read directly via
// the Webflow MCP data_scripts_tool > get_page_freeform_code against page
// id 665f5b07319971d77a6e1313). Both queries are plain SELECTs: this page
// has no write actions, matching the read-only RLS policies on both
// tables (see pg_policies -- no INSERT policy on plaid_transactions at
// all; account rows are only ever written by the Accounts page).

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

// Matches the live script's query exactly: only non-pending transactions
// count toward balances/charts (a pending debit can still be reversed).
export async function fetchPlaidTransactions(
  supabase: SupabaseClient,
  userId: string
): Promise<PlaidTransaction[]> {
  const { data, error } = await supabase
    .from("plaid_transactions")
    .select("amount,transaction_date,account_id")
    .eq("user_id", userId)
    .eq("pending", false)
    .order("transaction_date", { ascending: true });
  if (error) {
    console.error("fetchPlaidTransactions failed", error);
    return [];
  }
  return (data ?? []) as PlaidTransaction[];
}

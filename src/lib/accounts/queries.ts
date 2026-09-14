import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountCategory, ManualAccount } from "./types";

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

// Write side of `manual_accounts`, added for Card Center and Invest
// Accounts (Banking itself stays read-only for now, same as it's always
// been -- see AccountsByCategoryTable's comment). RLS enforces
// paid/app_director on INSERT/UPDATE/DELETE already; these helpers just
// surface `error` so the calling page can show a plain-language message
// instead of a raw Postgres error for the free-tier case.
export type ManualAccountInput = {
  category: AccountCategory;
  institution_name: string;
  account_name: string;
  balance: number;
  interest_rate?: number | null;
  annual_fee?: number | null;
  notes?: string | null;
  retirement_type?: string | null;
  ira_asset_type?: string | null;
};

export async function addManualAccount(
  supabase: SupabaseClient,
  userId: string,
  input: ManualAccountInput
): Promise<{ account: ManualAccount | null; error: string | null }> {
  const { data, error } = await supabase
    .from("manual_accounts")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  if (error) {
    console.error("addManualAccount failed", error);
    return { account: null, error: error.code === "42501" ? "forbidden" : error.message };
  }
  return { account: data as ManualAccount, error: null };
}

export async function updateManualAccount(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ManualAccountInput>
): Promise<{ account: ManualAccount | null; error: string | null }> {
  const { data, error } = await supabase
    .from("manual_accounts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error("updateManualAccount failed", error);
    return { account: null, error: error.code === "42501" ? "forbidden" : error.message };
  }
  return { account: data as ManualAccount, error: null };
}

export async function deleteManualAccount(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("manual_accounts").delete().eq("id", id);
  if (error) {
    console.error("deleteManualAccount failed", error);
    return { error: error.code === "42501" ? "forbidden" : error.message };
  }
  return { error: null };
}

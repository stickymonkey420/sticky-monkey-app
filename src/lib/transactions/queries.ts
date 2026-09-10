import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreditCardTransactionRow, CustomCategory } from "./types";

export type MutationResult = { error: string | null };

// All three ported 1:1 from the live Webflow page's head-code script (page
// id 665f5b07319971d77a6e1318) -- see calc.ts for the color/palette
// deviations and types.ts for why the RPCs exist instead of plain selects.

export async function fetchCreditCardTransactions(
  supabase: SupabaseClient,
  limit = 100
): Promise<CreditCardTransactionRow[]> {
  const { data, error } = await supabase.rpc("get_credit_card_transactions", { p_limit: limit });
  if (error) {
    console.error("fetchCreditCardTransactions failed", error);
    return [];
  }
  return (data ?? []) as CreditCardTransactionRow[];
}

export async function fetchCustomCategories(
  supabase: SupabaseClient,
  userId: string
): Promise<CustomCategory[]> {
  const { data, error } = await supabase
    .from("custom_transaction_categories")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchCustomCategories failed", error);
    return [];
  }
  return (data ?? []) as CustomCategory[];
}

export async function addCustomCategory(
  supabase: SupabaseClient,
  userId: string,
  key: string,
  label: string,
  color: string
): Promise<{ category: CustomCategory | null; error: string | null }> {
  const { data, error } = await supabase
    .from("custom_transaction_categories")
    .insert({ user_id: userId, key, label, color })
    .select()
    .single();
  if (error) return { category: null, error: error.message };
  return { category: data as CustomCategory, error: null };
}

// Rename and/or recolor one of the signed-in user's custom categories.
// Plain table UPDATE (not an RPC) -- the "update own custom categories"
// RLS policy (user_id = auth.uid()) on custom_transaction_categories
// already scopes this to the caller's own rows, so no server-side
// function is needed for it.
export async function updateCustomCategory(
  supabase: SupabaseClient,
  id: string,
  changes: { label?: string; color?: string }
): Promise<{ category: CustomCategory | null; error: string | null }> {
  const { data, error } = await supabase
    .from("custom_transaction_categories")
    .update(changes)
    .eq("id", id)
    .select()
    .single();
  if (error) return { category: null, error: error.message };
  return { category: data as CustomCategory, error: null };
}

// Removes a custom category outright. Transactions already tagged with
// its key are left as-is (category_bucket is a loose text column, not a
// foreign key) -- CategoryBadge/categoryByKey already fall back to the
// raw key label for an unrecognized category, so a deleted category's
// past transactions just show their bucket key instead of breaking.
export async function deleteCustomCategory(supabase: SupabaseClient, id: string): Promise<MutationResult> {
  const { error } = await supabase.from("custom_transaction_categories").delete().eq("id", id);
  return { error: error ? error.message : null };
}

export async function updateTransactionCategory(
  supabase: SupabaseClient,
  transactionId: string,
  categoryKey: string
): Promise<MutationResult> {
  const { error } = await supabase.rpc("update_transaction_category", {
    p_transaction_id: transactionId,
    p_category: categoryKey,
  });
  return { error: error ? error.message : null };
}

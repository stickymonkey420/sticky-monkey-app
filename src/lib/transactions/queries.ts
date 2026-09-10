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

import type { SupabaseClient } from "@supabase/supabase-js";

// Mutation functions for the Holdings page's row actions (Edit/Delete),
// following the same `{ error: string | null }` return shape as
// src/lib/options/mutations.ts so callers show errors the same way.

export type MutationResult = { error: string | null };

export type HoldingFormInput = {
  ticker: string;
  asset_class: string;
  shares: number;
  cost_basis: number | null;
  account_type: string;
};

export async function updateHolding(
  supabase: SupabaseClient,
  id: string,
  input: HoldingFormInput
): Promise<MutationResult> {
  const ticker = input.ticker.trim().toUpperCase();
  const { error } = await supabase
    .from("positions")
    .update({
      ticker,
      asset_class: input.asset_class,
      shares: input.shares,
      cost_basis: input.cost_basis,
      account_type: input.account_type,
    })
    .eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteHolding(supabase: SupabaseClient, id: string): Promise<MutationResult> {
  const { error } = await supabase.from("positions").delete().eq("id", id);
  return { error: error ? error.message : null };
}

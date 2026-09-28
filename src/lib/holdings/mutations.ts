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

// Add Holding (Holdings page "+ Add Holding"). If the same ticker already
// exists in that account, the shares are merged into it with a
// share-weighted average cost instead of creating a duplicate row. A new
// row starts priced at its cost basis so it shows a value right away; the
// sync-prices job (every 30 min) replaces it with the live quote.
export async function createHolding(
  supabase: SupabaseClient,
  userId: string,
  input: HoldingFormInput
): Promise<MutationResult> {
  const ticker = input.ticker.trim().toUpperCase();
  const { data: existing, error: findErr } = await supabase
    .from("positions")
    .select("id, shares, cost_basis")
    .eq("user_id", userId)
    .eq("account_type", input.account_type)
    .eq("ticker", ticker)
    .maybeSingle();
  if (findErr) return { error: findErr.message };

  if (existing) {
    const oldShares = Number(existing.shares) || 0;
    const newShares = oldShares + input.shares;
    const oldCost = existing.cost_basis == null ? null : Number(existing.cost_basis);
    const newCost =
      oldCost != null && input.cost_basis != null
        ? (oldShares * oldCost + input.shares * input.cost_basis) / newShares
        : (input.cost_basis ?? oldCost);
    const { error } = await supabase
      .from("positions")
      .update({ shares: newShares, cost_basis: newCost })
      .eq("id", existing.id);
    return { error: error ? error.message : null };
  }

  const { error } = await supabase.from("positions").insert({
    user_id: userId,
    account_type: input.account_type,
    ticker,
    asset_class: input.asset_class,
    shares: input.shares,
    cost_basis: input.cost_basis,
    price: input.cost_basis,
  });
  return { error: error ? error.message : null };
}

export async function deleteHolding(supabase: SupabaseClient, id: string): Promise<MutationResult> {
  const { error } = await supabase.from("positions").delete().eq("id", id);
  return { error: error ? error.message : null };
}

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

// Sell from Holdings: reduces (or closes) the position and, for taxable
// accounts (brokerage / crypto), records the realized gain in
// realized_gains (source "manual_sale") so Taxes > Imported Gains and the
// tax estimate pick it up. Retirement-account sales aren't taxable events.
export type SellInput = {
  shares: number;
  price: number;
  fees: number;
  dateSold: string; // YYYY-MM-DD
  dateAcquired: string | null;
};

export const TAXABLE_HOLDING_ACCOUNTS = ["brokerage", "crypto"];

export async function sellHolding(
  supabase: SupabaseClient,
  userId: string,
  holding: { id: string; ticker: string; shares: number | string; cost_basis: number | string | null; account_type: string },
  input: SellInput
): Promise<MutationResult & { gain?: number }> {
  const held = Number(holding.shares) || 0;
  const qty = Math.min(input.shares, held);
  if (!(qty > 0)) return { error: "Enter how many shares to sell." };
  if (!(input.price >= 0)) return { error: "Enter the sell price." };
  const round = (n: number) => Math.round(n * 100) / 100;
  const proceeds = round(qty * input.price - (input.fees || 0));
  const cost = round(qty * (holding.cost_basis == null ? 0 : Number(holding.cost_basis)));
  const gain = round(proceeds - cost);

  if (TAXABLE_HOLDING_ACCOUNTS.includes(holding.account_type)) {
    let term: "short" | "long" = "short";
    if (input.dateAcquired) {
      const a = new Date(input.dateAcquired + "T00:00:00");
      a.setFullYear(a.getFullYear() + 1);
      if (new Date(input.dateSold + "T00:00:00") > a) term = "long";
    }
    const { error: gErr } = await supabase.from("realized_gains").insert({
      user_id: userId,
      source: "manual_sale",
      import_batch: `holdings-sales-${input.dateSold.slice(0, 4)}`,
      file_name: "Sold from Holdings",
      symbol: holding.ticker,
      description: `Sold ${qty} ${holding.ticker} @ ${input.price}`,
      is_option: false,
      quantity: qty,
      date_acquired: input.dateAcquired,
      date_sold: input.dateSold,
      proceeds,
      cost_basis: cost,
      wash_sale: 0,
      gain,
      term,
      dedupe_key: `sale|${holding.id}|${input.dateSold}|${qty}|${input.price}|${Date.now()}`,
    });
    if (gErr) return { error: gErr.message };
  }

  const remaining = held - qty;
  const { error } =
    remaining > 1e-9
      ? await supabase.from("positions").update({ shares: remaining }).eq("id", holding.id)
      : await supabase.from("positions").delete().eq("id", holding.id);
  return { error: error ? error.message : null, gain };
}

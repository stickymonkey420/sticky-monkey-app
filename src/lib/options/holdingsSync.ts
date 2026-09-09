import type { SupabaseClient } from "@supabase/supabase-js";

// Ported 1:1 from adjustHoldingsForAssignment() in the live Webflow
// Options page's script (project doc `claude/roll-positions-options-script.html`).
// Do not change this math without re-checking that script -- it's real
// accounting logic shared with the live app (see
// `claude/options-trading-reference.md` for the CSP/CC assignment rules
// this implements).
//
// CSP assigned: forced to buy 100 x contracts shares at the strike,
// offset by the premium already collected -- effective cost basis =
// strike - premium. If the account already holds shares of this ticker
// in this account, the new shares are weighted-averaged into the existing
// cost basis; otherwise a new `positions` row is created.
//
// CC assigned ("called away"): forced to sell 100 x contracts shares at
// the strike -- those shares are removed from `positions`. If the sale
// exhausts the whole position (or somehow overshoots, e.g. from data
// entered by hand elsewhere), the row is deleted rather than left at a
// zero/negative share count; otherwise `shares` is decremented in place
// and the cost basis is left untouched (selling shares doesn't change the
// per-share cost basis of the shares that remain).

export type AssignmentHoldingsInput = {
  ticker: string;
  accountType: string;
  contracts: number;
  strike: number;
  premium: number;
};

export type HoldingsSyncResult = { error: string | null };

export async function adjustHoldingsForAssignment(
  supabase: SupabaseClient,
  userId: string,
  pos: AssignmentHoldingsInput,
  isCSP: boolean
): Promise<HoldingsSyncResult> {
  const shareQty = 100 * (Number(pos.contracts) || 0);

  const { data: rows, error: selectError } = await supabase
    .from("positions")
    .select("id,shares,cost_basis")
    .eq("user_id", userId)
    .eq("ticker", pos.ticker)
    .eq("account_type", pos.accountType)
    .limit(1);
  if (selectError) return { error: selectError.message };

  const existing = (rows && rows[0]) as
    | { id: string; shares: number | string; cost_basis: number | string | null }
    | undefined;

  if (isCSP) {
    const effCost = Number(pos.strike) - Number(pos.premium || 0);
    if (existing) {
      const oldShares = Number(existing.shares) || 0;
      const newShares = oldShares + shareQty;
      const oldCost =
        existing.cost_basis === null || existing.cost_basis === undefined
          ? null
          : Number(existing.cost_basis);
      const newCost =
        oldCost !== null
          ? (oldShares * oldCost + shareQty * effCost) / newShares
          : effCost;
      const { error } = await supabase
        .from("positions")
        .update({ shares: newShares, cost_basis: newCost })
        .eq("id", existing.id);
      return { error: error ? error.message : null };
    }
    const { error } = await supabase.from("positions").insert({
      user_id: userId,
      account_type: pos.accountType,
      ticker: pos.ticker,
      asset_class: "equity",
      shares: shareQty,
      cost_basis: effCost,
    });
    return { error: error ? error.message : null };
  }

  // CC called away.
  if (!existing) return { error: null };
  const remain = (Number(existing.shares) || 0) - shareQty;
  if (remain <= 0) {
    const { error } = await supabase.from("positions").delete().eq("id", existing.id);
    return { error: error ? error.message : null };
  }
  const { error } = await supabase
    .from("positions")
    .update({ shares: remain })
    .eq("id", existing.id);
  return { error: error ? error.message : null };
}

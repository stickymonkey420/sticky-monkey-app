import type { SupabaseClient } from "@supabase/supabase-js";
import { adjustHoldingsForAssignment } from "./holdingsSync";
import { fmtDate, money } from "./queries";
import type { WheelTradeType } from "./types";

// Mutation functions for the Options page's write actions, ported from
// the live Webflow page's script (project doc
// `claude/roll-positions-options-script.html`). Each returns
// `{ error: string | null }` so callers can show a message the same way
// the rest of this app's mutations do (see InvestmentAlertCard's
// dismiss/delete pattern) instead of throwing.

export type MutationResult = { error: string | null };

export type TradeSource = "wheel" | "leap";

export type TradeLeg = WheelTradeType | "LEAP";

// One shared shape for both the Add and Edit Trade forms -- `leg`
// determines which table the mutation targets (`wheel_trades` for
// CSP/CC, `leap_positions` for LEAP) and which columns get the
// premium/entry-date value, exactly like the live script's single
// Add/Edit modal switching on `currentLeg`.
export type TradeFormInput = {
  leg: TradeLeg;
  accountType: string;
  ticker: string;
  strike: number;
  premium: number; // premium/sh for CSP/CC; cost/sh (avg_cost) for LEAP
  contracts: number;
  entryDate: string; // entry_date (wheel) or date_bought (LEAP)
  expiration: string; // exp_date (wheel) or expiration_date (LEAP)
  notes: string | null;
};

export async function addTrade(
  supabase: SupabaseClient,
  userId: string,
  input: TradeFormInput
): Promise<MutationResult> {
  const ticker = input.ticker.trim().toUpperCase();

  if (input.leg === "LEAP") {
    const { error } = await supabase.from("leap_positions").insert({
      user_id: userId,
      account_type: input.accountType,
      ticker,
      strike: input.strike,
      expiration_date: input.expiration,
      contracts: input.contracts,
      avg_cost: input.premium,
      // Matches the script: current_price is seeded to the entry cost on
      // add only -- it is never touched again by this app's writes.
      current_price: input.premium,
      date_bought: input.entryDate,
      notes: input.notes,
    });
    return { error: error ? error.message : null };
  }

  const { error } = await supabase.from("wheel_trades").insert({
    user_id: userId,
    account_type: input.accountType,
    ticker,
    trade_type: input.leg,
    strike: input.strike,
    premium: input.premium,
    contracts: input.contracts,
    entry_date: input.entryDate,
    exp_date: input.expiration,
    status: "open",
    notes: input.notes,
  });
  return { error: error ? error.message : null };
}

export async function editTrade(
  supabase: SupabaseClient,
  source: TradeSource,
  id: string,
  input: TradeFormInput
): Promise<MutationResult> {
  const ticker = input.ticker.trim().toUpperCase();

  if (source === "leap") {
    const { error } = await supabase
      .from("leap_positions")
      .update({
        account_type: input.accountType,
        ticker,
        strike: input.strike,
        expiration_date: input.expiration,
        contracts: input.contracts,
        avg_cost: input.premium,
        date_bought: input.entryDate,
        notes: input.notes,
      })
      .eq("id", id);
    return { error: error ? error.message : null };
  }

  const { error } = await supabase
    .from("wheel_trades")
    .update({
      account_type: input.accountType,
      ticker,
      trade_type: input.leg,
      strike: input.strike,
      premium: input.premium,
      contracts: input.contracts,
      entry_date: input.entryDate,
      exp_date: input.expiration,
      notes: input.notes,
    })
    .eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteTrade(
  supabase: SupabaseClient,
  source: TradeSource,
  id: string
): Promise<MutationResult> {
  const table = source === "leap" ? "leap_positions" : "wheel_trades";
  const { error } = await supabase.from(table).delete().eq("id", id);
  return { error: error ? error.message : null };
}

// The two "Mark as..." outcomes that need no further user input beyond a
// confirm dialog (Expired worthless / Assigned-or-called-away). "Bought
// to close" and "Roll" collect additional numbers (close cost, new
// strike/expiration/premium) via their own modals -- see closeToClose()
// and rollTrade() below.
export type DirectMarkStatus = "expired" | "assigned";

export type MarkStatusInput = {
  id: string;
  ticker: string;
  accountType: string;
  type: WheelTradeType;
  contracts: number;
  strike: number;
  premium: number;
};

export async function markStatus(
  supabase: SupabaseClient,
  userId: string,
  pos: MarkStatusInput,
  status: DirectMarkStatus
): Promise<MutationResult> {
  if (status === "assigned") {
    const isCSP = pos.type === "CSP";
    const holdingsResult = await adjustHoldingsForAssignment(
      supabase,
      userId,
      {
        ticker: pos.ticker,
        accountType: pos.accountType,
        contracts: pos.contracts,
        strike: pos.strike,
        premium: pos.premium,
      },
      isCSP
    );
    if (holdingsResult.error) return holdingsResult;
  }

  const { error } = await supabase
    .from("wheel_trades")
    .update({ status, close_date: new Date().toISOString().slice(0, 10) })
    .eq("id", pos.id);
  return { error: error ? error.message : null };
}

// Standalone buy-to-close: just flips status + records the closing debit.
// Does not touch `positions` -- closing a CSP/CC leg early never changes
// share holdings, only whether the premium collected nets out to a gain
// or a loss (surfaced live in CloseToCloseModal, not persisted here).
export async function closeToClose(
  supabase: SupabaseClient,
  tradeId: string,
  costPerShare: number
): Promise<MutationResult> {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("wheel_trades")
    .update({ status: "closed", close_date: today, close_price: costPerShare })
    .eq("id", tradeId);
  return { error: error ? error.message : null };
}

export type RollInput = {
  contracts: number;
  closeCost: number; // buy-to-close cost / sh for the OLD leg
  newStrike: number;
  newExpiration: string;
  newPremium: number; // premium received / sh for the NEW leg
};

export type RollPositionInput = {
  id: string;
  ticker: string;
  type: WheelTradeType;
  accountType: string;
  strike: number;
  expiration: string | null;
  notes: string | null;
  originTradeId: string | null;
};

// Ported 1:1 from submitRoll() in the live script: inserts the new leg
// first, then closes the old one, so a failure between the two steps
// never silently deletes/loses the old leg without a replacement existing.
// Chaining rule (do not change without re-checking the script): every leg
// in a chain carries the SAME origin id -- if the leg being rolled is
// itself already a roll (has an origin_trade_id), the new leg inherits
// that same id; otherwise the leg being rolled IS the origin, so the new
// leg's origin_trade_id becomes that leg's own id.
export async function rollTrade(
  supabase: SupabaseClient,
  userId: string,
  pos: RollPositionInput,
  input: RollInput
): Promise<MutationResult> {
  const today = new Date().toISOString().slice(0, 10);
  const originId = pos.originTradeId || pos.id;
  const oldNoteAddition = `Rolled to ${money(input.newStrike)} exp ${fmtDate(
    input.newExpiration
  )} on ${fmtDate(today)}`;
  const newNote = `Rolled from ${money(pos.strike)} exp ${fmtDate(pos.expiration)}`;

  const { error: insertError } = await supabase.from("wheel_trades").insert({
    user_id: userId,
    account_type: pos.accountType,
    ticker: pos.ticker,
    trade_type: pos.type,
    strike: input.newStrike,
    premium: input.newPremium,
    contracts: input.contracts,
    entry_date: today,
    exp_date: input.newExpiration,
    status: "open",
    notes: newNote,
    origin_trade_id: originId,
  });
  if (insertError) return { error: insertError.message };

  const { error: closeError } = await supabase
    .from("wheel_trades")
    .update({
      status: "rolled",
      close_date: today,
      close_price: input.closeCost,
      notes: pos.notes ? `${pos.notes} | ${oldNoteAddition}` : oldNoteAddition,
    })
    .eq("id", pos.id);
  if (closeError) return { error: closeError.message };

  return { error: null };
}

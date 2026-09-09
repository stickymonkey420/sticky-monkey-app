import { money } from "./queries";

// Pure calculation helpers shared by the Add/Edit, Roll, and Close-to-Close
// modals. Kept side-effect-free (no Supabase, no fetch) so they're safe to
// import from both the real components and their QA preview counterparts
// without risking a real network/mutation call.

export function computeReturnPct(strike: number, premium: number): number | null {
  if (!(strike > 0) || Number.isNaN(premium) || premium < 0) return null;
  return (premium / strike) * 100;
}

export type IfAssignedProfit = {
  totalProfit: number;
  pct: number | null;
  shares: number;
};

// Covered-call "if assigned" payoff: the capital gain/loss from selling
// the shares at the strike versus their actual cost basis, plus the
// premium already collected -- the total realized outcome if this CC
// gets exercised. Ported from updateAssignProfit() in the live script.
export function computeIfAssignedProfit(input: {
  strike: number;
  premium: number;
  contracts: number;
  costBasis: number;
}): IfAssignedProfit | null {
  const { strike, premium, contracts, costBasis } = input;
  if (!(strike > 0) || Number.isNaN(premium) || premium < 0 || !(contracts >= 1) || !(costBasis > 0)) {
    return null;
  }
  const shares = 100 * contracts;
  const capGain = (strike - costBasis) * shares;
  const premiumTotal = premium * shares;
  const totalProfit = capGain + premiumTotal;
  const costTotal = costBasis * shares;
  const pct = costTotal > 0 ? (totalProfit / costTotal) * 100 : null;
  return { totalProfit, pct, shares };
}

export type Moneyness = {
  label: string;
  tone: "safe" | "risk-put" | "risk-call";
  diff: number;
};

// Green/red/amber read on where the stock sits relative to the strike
// being rolled or closed, using the leg's type to decide which side is
// risk. Ported from moneynessBadge() in the live script.
export function computeMoneyness(
  type: "CSP" | "CC",
  strike: number,
  price: number
): Moneyness | null {
  if (price === null || price === undefined || Number.isNaN(price)) return null;
  const isCSP = type === "CSP";
  const itm = isCSP ? price < strike : price > strike;
  const diff = Math.abs(price - strike);
  if (!itm) return { label: `OTM by ${money(diff)} — safe`, tone: "safe", diff };
  if (isCSP) return { label: `ITM by ${money(diff)} — assignment risk`, tone: "risk-put", diff };
  return { label: `ITM by ${money(diff)} — call-away risk`, tone: "risk-call", diff };
}

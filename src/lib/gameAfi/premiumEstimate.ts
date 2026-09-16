import type { ContractType } from "./contractTypes";

const SIGMA = 0.35;

// Client-side mirror of game_afi_paper_sell_contract's Black-Scholes-lite
// premium estimate (see the add_game_afi_full_wheel_with_assignment
// migration) -- same flat 35% assumed volatility and same logistic
// approximation of the normal CDF, so the "Sell a Contract" form can show a
// live preview of what a sale would pay before the member actually submits
// it. The RPC is still the source of truth for the real charged premium
// (it re-reads the live price server-side at submit time, which can have
// moved since this preview was computed); this is an estimate only.
export function estimateContractPremium(
  price: number | null,
  strike: number,
  contracts: number,
  expDate: string,
  contractType: ContractType
): number | null {
  if (price === null || !(price > 0) || !(strike > 0) || !(contracts > 0) || !expDate) return null;

  const todayUtc = new Date(new Date().toDateString()).getTime();
  const expUtc = new Date(`${expDate}T00:00:00Z`).getTime();
  if (Number.isNaN(expUtc)) return null;
  const days = Math.max(Math.round((expUtc - todayUtc) / 86400000), 1);
  const t = days / 365;

  const d1 = (Math.log(price / strike) + 0.5 * SIGMA ** 2 * t) / (SIGMA * Math.sqrt(t));
  const d2 = d1 - SIGMA * Math.sqrt(t);

  const perContract =
    contractType === "put"
      ? strike * (1 / (1 + Math.exp(1.702 * d2))) - price * (1 / (1 + Math.exp(1.702 * d1)))
      : price * (1 / (1 + Math.exp(-1.702 * d1))) - strike * (1 / (1 + Math.exp(-1.702 * d2)));

  return Math.max(perContract, 0.01) * 100 * contracts;
}

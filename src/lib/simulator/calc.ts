import type { CspTradeRow, SimulationResult, SimulatorInputs, YearlyRow } from "./types";

// Same sign-aware money() as options/queries.ts (the app-wide fix for
// negative values rendering "$-1,200.00" instead of "-$1,200.00").
export function money(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) n = 0;
  const value = Number(n);
  const sign = value < 0 ? "-" : "";
  return (
    sign +
    "$" +
    Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function pct(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) n = 0;
  return (Number(n) * 100).toFixed(decimals) + "%";
}

export const DEFAULT_INPUTS: SimulatorInputs = {
  capital: 0,
  ratePct: 0,
  margin: 0,
  marginRatePct: 0,
  expenses: 0,
  years: 10,
};

// Collateral-weighted average weekly return from real CSP trade history --
// per-trade return = premiumTotal / (strike*100 - premiumTotal), weighted
// by collateral = contracts*100*strike. Matches the user's personal
// "Average(W)" formula (SUMPRODUCT(collateral, return) / SUM(collateral)).
//
// wheel_trades.premium is quoted PER SHARE (standard options convention --
// same column computeReturnPct in options/calc.ts treats as premium/strike
// per share), so it has to be scaled by the 100 shares/contract before it's
// comparable to strike*100 collateral. An earlier version of this function
// used the raw per-share premium directly here, which understated every
// trade's return by ~100x (e.g. a real ~1.4% weekly rate came out as
// ~0.01%) -- caught from a user's simulator screenshot showing a
// suspiciously tiny "Use my CSP trade history" suggested rate.
export function computeSuggestedRate(rows: CspTradeRow[]): number | null {
  let weightedSum = 0;
  let totalCollateral = 0;
  for (const r of rows) {
    const strike = Number(r.strike) || 0;
    const premiumTotal = (Number(r.premium) || 0) * 100;
    const contracts = Number(r.contracts) || 0;
    const collateral = contracts * 100 * strike;
    const perContractCollateral = strike * 100 - premiumTotal;
    if (collateral <= 0 || perContractCollateral <= 0) continue;
    const perTradeReturn = premiumTotal / perContractCollateral;
    weightedSum += collateral * perTradeReturn;
    totalCollateral += collateral;
  }
  if (totalCollateral <= 0) return null;
  return weightedSum / totalCollateral;
}

// One week's net income: gross return on capital minus the pro-rated
// weekly margin-interest cost and weekly-equivalent monthly expenses.
// NOTE on annualization (ported comment from the live script): the user's
// own spreadsheet used Monthly = Weekly*3 and Annual = Weekly*36 in its
// per-week projection columns, which is inconsistent with its own top
// "Estimated Return" section (Monthly = Weekly*52/12, Annual = Weekly*52).
// This port uses the mathematically correct 52-week-per-year convention
// throughout so the numbers aren't understated.
function weeklyCosts(marginLoan: number, marginRatePct: number, monthlyExpenses: number) {
  const weeklyMarginCost = (marginLoan * (marginRatePct / 100)) / 52;
  const weeklyExpenseCost = (monthlyExpenses * 12) / 52;
  return { weeklyMarginCost, weeklyExpenseCost };
}

export function simulateWeeks(
  startCapital: number,
  weeklyRate: number,
  marginLoan: number,
  marginRatePct: number,
  monthlyExpenses: number,
  weeksTotal: number
): SimulationResult {
  const { weeklyMarginCost, weeklyExpenseCost } = weeklyCosts(marginLoan, marginRatePct, monthlyExpenses);
  let capital = startCapital;
  let cumulativeNet = 0;
  const series = [capital];
  for (let w = 0; w < weeksTotal; w++) {
    const gross = capital * weeklyRate;
    const net = gross - weeklyMarginCost - weeklyExpenseCost;
    capital += net;
    cumulativeNet += net;
    series.push(capital);
  }
  return { finalCapital: capital, cumulativeNet, series };
}

// Long-term table: run the same weekly loop out to `years` years, sampling
// the capital + cumulative net income at the end of each year.
export function computeYearlyRows(
  effectiveCapital: number,
  weeklyRate: number,
  marginLoan: number,
  marginRatePct: number,
  monthlyExpenses: number,
  years: number
): YearlyRow[] {
  const { weeklyMarginCost, weeklyExpenseCost } = weeklyCosts(marginLoan, marginRatePct, monthlyExpenses);
  const weeksTotal = years * 52;
  let capital = effectiveCapital;
  let cumulativeNet = 0;
  const rows: YearlyRow[] = [];
  for (let wk = 1; wk <= weeksTotal; wk++) {
    const gross = capital * weeklyRate;
    const net = gross - weeklyMarginCost - weeklyExpenseCost;
    capital += net;
    cumulativeNet += net;
    if (wk % 52 === 0) {
      rows.push({ year: wk / 52, capital, cumulativeNet });
    }
  }
  return rows;
}

export type SimulatorSummary = {
  weeklyNet: number;
  monthlyNet: number;
  annualNet: number;
  yearEndCapital: number;
  yearEndCumulativeNet: number;
  series52: number[];
  yearlyRows: YearlyRow[];
};

// Clamps mirror the live script's recalc(): capital/margin/expenses floor
// at 0, years clamps to [1, 30].
export function computeSummary(inputs: SimulatorInputs): SimulatorSummary {
  const startCapital = Math.max(0, inputs.capital || 0);
  const weeklyRate = (inputs.ratePct || 0) / 100;
  const marginLoan = Math.max(0, inputs.margin || 0);
  const marginRatePct = Math.max(0, inputs.marginRatePct || 0);
  const monthlyExpenses = Math.max(0, inputs.expenses || 0);
  const years = Math.max(1, Math.min(30, Math.round(inputs.years || 10)));

  const effectiveCapital = startCapital + marginLoan;

  const week52 = simulateWeeks(effectiveCapital, weeklyRate, marginLoan, marginRatePct, monthlyExpenses, 52);
  const { weeklyMarginCost, weeklyExpenseCost } = weeklyCosts(marginLoan, marginRatePct, monthlyExpenses);
  const firstWeekGross = effectiveCapital * weeklyRate;
  const firstWeekNet = firstWeekGross - weeklyMarginCost - weeklyExpenseCost;

  const yearlyRows = computeYearlyRows(effectiveCapital, weeklyRate, marginLoan, marginRatePct, monthlyExpenses, years);

  return {
    weeklyNet: firstWeekNet,
    monthlyNet: (firstWeekNet * 52) / 12,
    annualNet: firstWeekNet * 52,
    yearEndCapital: week52.finalCapital,
    yearEndCumulativeNet: week52.cumulativeNet,
    series52: week52.series,
    yearlyRows,
  };
}

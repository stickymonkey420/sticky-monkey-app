// Port of the live "Weekly Income Simulator (Wheel Strategy)" widget (footer
// custom code on the Simulator page, page id 6a8cd798d6044b9cc6fbe79f).
export type CspTradeRow = {
  strike: number | null;
  premium: number | null;
  contracts: number | null;
};

export type SimulationResult = {
  finalCapital: number;
  cumulativeNet: number;
  series: number[]; // capital at week 0 (start) through week N
};

export type YearlyRow = {
  year: number;
  capital: number;
  cumulativeNet: number;
};

export type SimulatorInputs = {
  capital: number;
  ratePct: number; // weekly return, as a percent (e.g. 1.5 = 1.5%)
  margin: number;
  marginRatePct: number; // margin loan APR, as a percent
  expenses: number; // monthly expenses
  years: number;
};

import { FED, STATES, type Brackets, type FilingStatus } from "./data2026";

// Simplified 2026 tax ESTIMATE. Not tax advice. Ignores AMT, most credits
// (other than the child tax credit), local/city taxes, QBI deduction,
// state-specific income adjustments, and phase-outs except where noted.

export type TaxInput = {
  status: FilingStatus;
  state: string;
  wages: number; // W-2 gross
  selfEmployment: number; // net side gig / business profit
  shortTermGains: number; // incl. options premium in taxable accounts (can be negative)
  longTermGains: number; // held > 1 year (can be negative)
  qualifiedDividends: number;
  interestOrdinaryDividends: number;
  otherIncome: number;
  preTaxContributions: number; // 401(k)/403(b)/traditional IRA/HSA
  itemized: number; // 0 = take the standard deduction
  children: number; // under 17, for the child tax credit
  withheld: number; // federal withholding so far
  estimatesPaid: number; // federal estimated payments so far
};

export const EMPTY_INPUT: TaxInput = {
  status: "single",
  state: "FL",
  wages: 0,
  selfEmployment: 0,
  shortTermGains: 0,
  longTermGains: 0,
  qualifiedDividends: 0,
  interestOrdinaryDividends: 0,
  otherIncome: 0,
  preTaxContributions: 0,
  itemized: 0,
  children: 0,
  withheld: 0,
  estimatesPaid: 0,
};

export function bracketTax(income: number, brackets: Brackets): number {
  if (income <= 0) return 0;
  let tax = 0;
  for (let i = 0; i < brackets.length; i++) {
    const [start, rate] = brackets[i];
    const end = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
    if (income <= start) break;
    tax += (Math.min(income, end) - start) * rate;
  }
  return tax;
}

export function marginalRate(income: number, brackets: Brackets): number {
  let r = 0;
  for (const [start, rate] of brackets) if (income > start) r = rate;
  return r;
}

export type TaxResult = {
  agi: number;
  deduction: number;
  usedItemized: boolean;
  taxableIncome: number;
  preferentialIncome: number;
  ordinaryTax: number;
  capitalGainsTax: number;
  childCredit: number;
  federalIncomeTax: number;
  selfEmploymentTax: number;
  niit: number;
  additionalMedicare: number;
  federalTotal: number;
  stateTax: number;
  stateTaxable: number;
  stateNote: string | null;
  totalTax: number;
  totalIncome: number;
  effectiveRate: number;
  federalMarginal: number;
  stateMarginal: number;
  paid: number;
  balanceDue: number; // federal only; negative = refund
};

export function estimateTax(i: TaxInput): TaxResult {
  const s = i.status;
  const pos = (n: number) => Math.max(0, n || 0);

  // Self-employment tax (Schedule SE)
  const seBase = pos(i.selfEmployment) * 0.9235;
  const ssRoom = Math.max(0, FED.ssWageBase - pos(i.wages));
  const selfEmploymentTax = seBase >= 400 ? Math.min(seBase, ssRoom) * 0.124 + seBase * 0.029 : 0;
  const halfSe = selfEmploymentTax / 2;

  // Capital gains netting
  const netCap = (i.shortTermGains || 0) + (i.longTermGains || 0);
  const capInIncome = netCap < 0 ? Math.max(netCap, -FED.capitalLossLimit) : netCap;
  const netLtForRates = netCap > 0 ? Math.max(0, Math.min(i.longTermGains || 0, netCap)) : 0;

  const totalIncome =
    pos(i.wages) + (i.selfEmployment || 0) + capInIncome + pos(i.qualifiedDividends) + pos(i.interestOrdinaryDividends) + (i.otherIncome || 0);
  const agi = Math.max(0, totalIncome - pos(i.preTaxContributions) - halfSe);

  const std = FED.standardDeduction[s];
  const usedItemized = pos(i.itemized) > std;
  const deduction = usedItemized ? pos(i.itemized) : std;
  const taxableIncome = Math.max(0, agi - deduction);

  const preferentialIncome = Math.min(taxableIncome, netLtForRates + pos(i.qualifiedDividends));
  const ordinaryTaxable = taxableIncome - preferentialIncome;
  const ordinaryTax = bracketTax(ordinaryTaxable, FED.brackets[s]);

  // LTCG stacked on top of ordinary income
  const { t0, t15 } = FED.ltcg[s];
  const at0 = Math.max(0, Math.min(preferentialIncome, t0 - ordinaryTaxable));
  const at15 = Math.max(0, Math.min(preferentialIncome - at0, t15 - Math.max(ordinaryTaxable, t0)));
  const at20 = Math.max(0, preferentialIncome - at0 - at15);
  const capitalGainsTax = at15 * 0.15 + at20 * 0.2;

  // Child tax credit with phase-out ($50 per $1,000 over threshold); not refundable here.
  const ctcFull = pos(i.children) * FED.childTaxCredit;
  const over = Math.max(0, agi - FED.ctcPhaseOut[s]);
  const ctcAllowed = Math.max(0, ctcFull - Math.ceil(over / 1000) * 50);
  const childCredit = Math.min(ctcAllowed, ordinaryTax + capitalGainsTax);
  const federalIncomeTax = ordinaryTax + capitalGainsTax - childCredit;

  const hi = FED.highIncomeThreshold[s];
  const investmentIncome = Math.max(0, netCap) + pos(i.qualifiedDividends) + pos(i.interestOrdinaryDividends);
  const niit = 0.038 * Math.max(0, Math.min(investmentIncome, agi - hi));
  const additionalMedicare = 0.009 * Math.max(0, pos(i.wages) + seBase - hi);

  const federalTotal = federalIncomeTax + selfEmploymentTax + niit + additionalMedicare;

  // State
  const st = STATES[i.state];
  let stateTax = 0;
  let stateTaxable = 0;
  let stateMarginal = 0;
  let stateNote: string | null = null;
  if (st && !st.none) {
    const idx = s === "mfj" ? 1 : 0;
    const br = (s === "mfj" ? st.mfj : st.single) ?? [];
    if (st.capGainsOnly) {
      stateTaxable = Math.max(0, netLtForRates - (st.sd?.[idx] ?? 0));
      stateNote = "Washington taxes only long-term capital gains above the standard deduction.";
    } else {
      stateTaxable = Math.max(0, agi - (st.sd?.[idx] ?? 0) - (st.pe?.[idx] ?? 0));
    }
    stateTax = Math.max(0, bracketTax(stateTaxable, br) - (st.peCredit?.[idx] ?? 0));
    stateMarginal = marginalRate(stateTaxable, br);
    if (s === "hoh" && !st.capGainsOnly) stateNote = "Head of household uses the state's single-filer brackets in this estimate.";
  } else if (st?.none) {
    stateNote = `${st.name} has no state income tax on wages.`;
  }

  const totalTax = federalTotal + stateTax;
  const paid = pos(i.withheld) + pos(i.estimatesPaid);
  return {
    agi,
    deduction,
    usedItemized,
    taxableIncome,
    preferentialIncome,
    ordinaryTax,
    capitalGainsTax,
    childCredit,
    federalIncomeTax,
    selfEmploymentTax,
    niit,
    additionalMedicare,
    federalTotal,
    stateTax,
    stateTaxable,
    stateNote,
    totalTax,
    totalIncome,
    effectiveRate: totalIncome > 0 ? totalTax / totalIncome : 0,
    federalMarginal: marginalRate(ordinaryTaxable, FED.brackets[s]),
    stateMarginal,
    paid,
    balanceDue: federalTotal - paid,
  };
}

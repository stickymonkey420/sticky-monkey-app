import type {
  WheelIncomeAccountType,
  WheelIncomeSummary,
  WheelTradeIncomeRow,
} from "@/lib/types/dashboard";

// Ported 1:1 from the live Webflow Dashboard page's "dash-income-*" widget
// (head-code script). Sums options premium (premium * contracts * 100) from
// wheel_trades per account_type; "realized" is the subset where status is
// no longer "open" (i.e. the position has been closed).

export const WHEEL_INCOME_ACCOUNTS: WheelIncomeAccountType[] = [
  "brokerage",
  "traditional",
  "roth",
];

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "$0.00";
  return "$" + Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function summarizeWheelIncome(rows: WheelTradeIncomeRow[]): WheelIncomeSummary {
  const buckets = {
    brokerage: { total: 0, realized: 0 },
    traditional: { total: 0, realized: 0 },
    roth: { total: 0, realized: 0 },
  } as WheelIncomeSummary;

  (rows || []).forEach((r) => {
    const acct = r.account_type as WheelIncomeAccountType;
    if (!buckets[acct]) return;
    const amt = (Number(r.premium) || 0) * (Number(r.contracts) || 0) * 100;
    buckets[acct].total += amt;
    if (r.status !== "open") buckets[acct].realized += amt;
  });

  return buckets;
}

import { CATEGORICAL_PALETTE, OTHER_COLOR } from "@/lib/palette";
import type { DonutSlice } from "@/lib/invest/calc";
import type { ManualAccount, PlaidTransaction } from "./types";

// Calc helpers for My Wallet, ported 1:1 from the live Webflow page's two
// head-code scripts (see queries.ts for where that source came from).
// Colors for the Top Spending donut and the Debit/Credit chart both draw
// from the shared src/lib/palette.ts sequence -- the live script's own
// colors (ROW_COLORS = ["#2263e4","#01bfbf","#028cd1"] for the donut,
// "#0147d3"/"#018dd3" for debit/credit) were all near-identical blues that
// would fail the dataviz skill's CVD/normal-vision checks, the same
// problem the Invest page's donuts had.

// ---- Balance / income / expense ----

export type WalletOverview = {
  balance: number; // bank_account/business_account balances minus credit_card balances -- My Wallet is banking-only, not every manual account
  totalIncome: number; // all-time sum of negative plaid_transactions.amount (negated)
  totalExpense: number; // all-time sum of positive plaid_transactions.amount
  netThisMonth: number; // this calendar month's income - expense (can be negative)
  monthIncome: number; // this calendar month's income only (was computed internally but not exposed)
  monthExpense: number; // this calendar month's expense only
};

export function computeWalletOverview(
  accounts: ManualAccount[],
  txs: PlaidTransaction[]
): WalletOverview {
  // My Wallet's headline balance is banking + credit cards only -- it
  // used to sum every manual account except credit cards (so a
  // brokerage/retirement/precious-metal balance inflated it well past
  // what a wallet/banking view should show). Same bank-only definition
  // as the Banking page's own Total Assets/Credit Card Balance cards
  // (src/lib/accounts/calc.ts's computeAccountsSummary) -- computed
  // inline here rather than imported since this file already owns its
  // own single-pass reduction over `accounts`.
  let bankTotal = 0;
  let creditCardTotal = 0;
  accounts.forEach((a) => {
    const bal = Number(a.balance) || 0;
    if (a.category === "credit_card") creditCardTotal += bal;
    else if (a.category === "bank_account" || a.category === "business_account") bankTotal += bal;
  });
  const balance = bankTotal - creditCardTotal;

  let totalIncome = 0;
  let totalExpense = 0;
  let monthIncome = 0;
  let monthExpense = 0;
  const nowMonth = new Date().toISOString().slice(0, 7);
  txs.forEach((t) => {
    const amt = Number(t.amount) || 0;
    const isCurMonth = String(t.transaction_date).slice(0, 7) === nowMonth;
    if (amt < 0) {
      totalIncome += -amt;
      if (isCurMonth) monthIncome += -amt;
    } else if (amt > 0) {
      totalExpense += amt;
      if (isCurMonth) monthExpense += amt;
    }
  });

  return { balance, totalIncome, totalExpense, netThisMonth: monthIncome - monthExpense, monthIncome, monthExpense };
}

// ---- Top Spending by Account donut ----

export type TopSpendingResult = { slices: DonutSlice[]; topPct: number };

// Exactly 3 rows, matching the live page's fixed 3-row markup
// (us-row-0/1/2): the top 2 accounts by spend, plus a 3rd row that is
// either the literal 3rd account (when there are 3 or fewer) or an
// "Other" bucket folding in every account past the top 2 (when there are
// more than 3) -- not a top-3-then-separate-Other list.
export function computeTopSpendingByAccount(
  txs: PlaidTransaction[],
  accounts: ManualAccount[]
): TopSpendingResult {
  const acctName = new Map<string, string>();
  accounts.forEach((a) => acctName.set(a.id, a.account_name || a.institution_name || "Account"));

  const spendByAccount = new Map<string, number>();
  txs.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (amt > 0 && t.account_id) {
      spendByAccount.set(t.account_id, (spendByAccount.get(t.account_id) || 0) + amt);
    }
  });

  const ranked = Array.from(spendByAccount, ([id, amt]) => ({
    label: acctName.get(id) || "Account",
    amt,
  })).sort((a, b) => b.amt - a.amt);
  const total = ranked.reduce((s, r) => s + r.amt, 0);

  if (!ranked.length || total <= 0) return { slices: [], topPct: 0 };

  const top = ranked.slice(0, 3);
  if (ranked.length > 3) {
    const otherAmt = ranked.slice(2).reduce((s, r) => s + r.amt, 0);
    top[2] = { label: "Other", amt: otherAmt };
  }

  const slices: DonutSlice[] = top.map((r, i) => ({
    name: r.label,
    value: r.amt,
    color: r.label === "Other" ? OTHER_COLOR : CATEGORICAL_PALETTE[i],
  }));
  const topPct = total > 0 ? (top[0].amt / total) * 100 : 0;
  return { slices, topPct };
}

// ---- Debit / Credit bar chart ----

export type FlowBucket = { label: string; debit: number; credit: number };
export type FlowGranularity = "monthly" | "weekly" | "ytd" | "alltime";

function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7)) - 1;
  return new Date(year, month, 1).toLocaleDateString("en-US", { month: "short" });
}

function weekLabel(key: string): string {
  return new Date(key + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const GRANULARITY_CONFIG: Record<
  FlowGranularity,
  { keyFn: (d: string) => string; labelFn: (k: string) => string; max: number }
> = {
  monthly: { keyFn: (d) => String(d).slice(0, 7), labelFn: monthLabel, max: 12 },
  weekly: { keyFn: isoWeekStart, labelFn: weekLabel, max: 12 },
  // Same month-keyed buckets as "monthly", but scoped below to just the
  // current calendar year (Jan through the current month) instead of
  // "monthly"'s rolling trailing-12-months window.
  ytd: { keyFn: (d) => String(d).slice(0, 7), labelFn: monthLabel, max: 12 },
  alltime: { keyFn: (d) => String(d).slice(0, 4), labelFn: (k) => k, max: 10 },
};

// "Debit" = money out (positive amount), "credit" = money in (negative
// amount) -- same sign convention as computeWalletOverview, matching the
// live script's buckets() helper.
export function computeFlowBuckets(
  txs: PlaidTransaction[],
  granularity: FlowGranularity
): FlowBucket[] {
  const { keyFn, labelFn, max } = GRANULARITY_CONFIG[granularity];
  const source =
    granularity === "ytd"
      ? txs.filter((t) => String(t.transaction_date).slice(0, 4) === String(new Date().getFullYear()))
      : txs;
  const map = new Map<string, { debit: number; credit: number }>();
  source.forEach((t) => {
    const key = keyFn(t.transaction_date);
    const entry = map.get(key) || { debit: 0, credit: 0 };
    const amt = Number(t.amount) || 0;
    if (amt > 0) entry.debit += amt;
    else if (amt < 0) entry.credit += -amt;
    map.set(key, entry);
  });

  let keys = Array.from(map.keys()).sort();
  if (keys.length > max) keys = keys.slice(keys.length - max);
  return keys.map((k) => {
    const entry = map.get(k)!;
    return { label: labelFn(k), debit: entry.debit, credit: entry.credit };
  });
}

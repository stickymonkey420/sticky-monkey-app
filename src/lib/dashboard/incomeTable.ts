import type { WheelTradeIncomeRow } from "@/lib/types/dashboard";

// The live Webflow Dashboard's Net Worth card embeds an Income table
// (ACCOUNT / WEEK / MONTH / YTD / COLLATERAL) rather than showing it as a
// separate widget. Ported here as a best-effort mechanical reconstruction
// from `wheel_trades` (premium*contracts*100 income, bucketed by
// entry_date; collateral = strike*contracts*100 for open CSPs, the
// standard cash-secured-put collateral definition) since the original
// head-code script for this specific widget wasn't available to port 1:1.
// The live site's "Projected" row shows $0.00/$0.00/--/-- in every account
// -- reproduced as a static placeholder row rather than guessed at.

export type IncomeTableRow = {
  account: string;
  week: number;
  month: number;
  ytd: number;
  collateral: number | null; // null renders as "--"
};

export type IncomeTableTrade = WheelTradeIncomeRow & {
  entry_date?: string | null;
  close_date?: string | null;
  strike?: number | string | null;
  trade_type?: string | null;
};

// Standard cash-secured-put collateral (strike * contracts * 100) minus the
// premium already collected -- this is the same "net cash at risk" formula
// src/lib/options/queries.ts's computePremiumSummary() uses for its
// "Capital at Risk" card. Previously this table showed the gross,
// un-netted strike*contracts*100 figure, which could disagree with the
// Options page's number for the exact same open position; now both read
// the same way.
function netCollateral(strike: number, premium: number, contracts: number): number {
  return (strike - premium) * contracts * 100;
}

const ACCOUNT_ORDER: { key: string; label: string }[] = [
  { key: "brokerage", label: "Brokerage (Taxable)" },
  { key: "traditional", label: "Traditional IRA" },
  { key: "roth", label: "Roth IRA" },
];

function isoWeekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? 6 : day - 1;
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - diff);
  return copy;
}

// `enabledAccountKeys` is the signed-in profile's `account_types` (see
// lib/usersGroups/types.ts) -- when provided, rows are limited to accounts
// the profile actually has turned on, so a profile with no brokerage/
// traditional/roth accounts enabled doesn't show three all-zero rows for
// accounts that don't apply to it. Passing null/undefined keeps the old
// "show all three" behavior for any caller that hasn't been updated yet.
export function computeIncomeTable(
  trades: IncomeTableTrade[],
  enabledAccountKeys?: string[] | null
): IncomeTableRow[] {
  const now = new Date();
  const weekStart = isoWeekStart(now);
  // Local calendar month/year, not toISOString()'s UTC conversion -- a
  // negative-UTC-offset user (all of the US) near midnight local time would
  // otherwise get bucketed into the wrong month/year (see entryDate below
  // for the matching fix on the other side of this comparison).
  const pad2 = (n: number) => (n < 10 ? "0" + n : "" + n);
  const monthKey = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  const yearKey = `${now.getFullYear()}`;

  const accountOrder = enabledAccountKeys
    ? ACCOUNT_ORDER.filter((a) => enabledAccountKeys.includes(a.key))
    : ACCOUNT_ORDER;

  const buckets: Record<string, { week: number; month: number; ytd: number; collateral: number }> = {};
  accountOrder.forEach((a) => {
    buckets[a.key] = { week: 0, month: 0, ytd: 0, collateral: 0 };
  });

  // Adds `amount` to whichever of week/month/YTD the given local date falls in.
  const addOnDate = (acct: string, dateStr: string | null | undefined, amount: number) => {
    if (!dateStr || !amount) return;
    // Force local-midnight parsing (matches historyCharts.ts's
    // bucketIndexFor) instead of bare `new Date("YYYY-MM-DD")`, which
    // parses as UTC midnight -- for a negative-UTC-offset user that pushed
    // a boundary-day trade into the wrong week/month/year bucket.
    const d = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(d.getTime())) return;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const dMonthKey = `${y}-${m < 10 ? "0" + m : m}`;
    if (d >= weekStart) buckets[acct].week += amount;
    if (dMonthKey === monthKey) buckets[acct].month += amount;
    if (`${y}` === yearKey) buckets[acct].ytd += amount;
  };

  trades.forEach((t) => {
    const acct = (t.account_type || "").toString().trim().toLowerCase();
    if (!buckets[acct]) return;
    const premium = Number(t.premium) || 0;
    const contracts = Number(t.contracts) || 0;

    // Cash basis: premium counts on the day it was collected (entry_date);
    // a buy-to-close cost ("closed"/"rolled" legs) counts on the day it was
    // paid (close_date). Previously the close cost was netted against the
    // leg's ENTRY date, so rolling an old position put the new leg's full
    // premium in this week while its buy-back cost landed weeks/months
    // earlier -- overstating Week/Month by the whole buy-back amount
    // instead of showing the roll's net credit/debit. Falls back to
    // entry_date only if close_date is missing (legacy rows).
    addOnDate(acct, t.entry_date, premium * contracts * 100);
    if (t.status === "closed" || t.status === "rolled") {
      const closeCost = (Number(t.close_price) || 0) * contracts * 100;
      addOnDate(acct, t.close_date || t.entry_date, -closeCost);
    }

    if (t.status === "open" && (t.trade_type || "").toString().toUpperCase() === "CSP") {
      buckets[acct].collateral += netCollateral(Number(t.strike) || 0, premium, contracts);
    }
  });

  return accountOrder.map((a) => ({
    account: a.label,
    week: buckets[a.key].week,
    month: buckets[a.key].month,
    ytd: buckets[a.key].ytd,
    collateral: buckets[a.key].collateral,
  }));
}

// Static placeholder row -- matches the live site's own "Projected" row,
// which shows $0.00/$0.00 with YTD/Collateral dashed out rather than any
// computed projection.
export const PROJECTED_ROW: IncomeTableRow = {
  account: "Projected",
  week: 0,
  month: 0,
  ytd: NaN, // NaN renders as "--"
  collateral: null,
};

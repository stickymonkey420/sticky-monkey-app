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
  strike?: number | string | null;
  trade_type?: string | null;
};

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

export function computeIncomeTable(trades: IncomeTableTrade[]): IncomeTableRow[] {
  const now = new Date();
  const weekStart = isoWeekStart(now);
  const monthKey = now.toISOString().slice(0, 7);
  const yearKey = now.toISOString().slice(0, 4);

  const buckets: Record<string, { week: number; month: number; ytd: number; collateral: number }> = {};
  ACCOUNT_ORDER.forEach((a) => {
    buckets[a.key] = { week: 0, month: 0, ytd: 0, collateral: 0 };
  });

  trades.forEach((t) => {
    const acct = (t.account_type || "").toString().trim().toLowerCase();
    if (!buckets[acct]) return;
    const income = (Number(t.premium) || 0) * (Number(t.contracts) || 0) * 100;
    const entryDate = t.entry_date ? new Date(t.entry_date) : null;

    if (entryDate && !Number.isNaN(entryDate.getTime())) {
      if (entryDate >= weekStart) buckets[acct].week += income;
      if (entryDate.toISOString().slice(0, 7) === monthKey) buckets[acct].month += income;
      if (entryDate.toISOString().slice(0, 4) === yearKey) buckets[acct].ytd += income;
    }

    if (t.status === "open" && (t.trade_type || "").toString().toUpperCase() === "CSP") {
      buckets[acct].collateral += (Number(t.strike) || 0) * (Number(t.contracts) || 0) * 100;
    }
  });

  return ACCOUNT_ORDER.map((a) => ({
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

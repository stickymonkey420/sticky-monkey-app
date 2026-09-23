import type { SupabaseClient } from "@supabase/supabase-js";

// Shared bucket-building + income-aggregation logic ported 1:1 from the live
// Webflow Dashboard's Income History and Net Worth History chart widgets
// (Supabase Edge Functions net-worth-history-chart-js and
// net-worth-history-copy-chart-js -- the two are near-identical, differing
// only in which second series they plot alongside the Income bars).

export type Granularity = "weekly" | "monthly" | "quarterly" | "ytd" | "1year";

export const GRANULARITIES: { value: Granularity; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "ytd", label: "YTD" },
  { value: "1year", label: "1 Year" },
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type HistoryBucket = {
  start: Date;
  end: Date;
  label: string;
  months: number;
  income: number; // realized only: wheel premium + completed business jobs
  netWorth: number | null;
  // Unrealized (mark-to-market) position gains, tracked separately from
  // `income` -- NOT included in it or in the goal beat/miss comparison,
  // since a paper gain can reverse before it's ever realized. Surfaced as
  // an informational note in the tooltip instead.
  unrealizedGains: number;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function isoDate(d: Date): string {
  const pad2 = (n: number) => (n < 10 ? "0" + n : "" + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "$0";
  const v = Number(n);
  return (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
}

export function buildBuckets(granularity: Granularity): HistoryBucket[] {
  const now = new Date();
  const buckets: HistoryBucket[] = [];

  if (granularity === "weekly") {
    for (let i = 11; i >= 0; i--) {
      let end = new Date(now);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      end = startOfDay(end);
      const s = startOfDay(start);
      buckets.push({
        start: s,
        end,
        label: `${s.getMonth() + 1}/${s.getDate()}`,
        months: 12 / 52,
        income: 0,
        netWorth: null,
        unrealizedGains: 0,
      });
    }
  } else if (granularity === "quarterly") {
    for (let q = 7; q >= 0; q--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - q * 3, 1);
      const qStartMonth = Math.floor(ref.getMonth() / 3) * 3;
      const qStart = new Date(ref.getFullYear(), qStartMonth, 1);
      const qEnd = new Date(ref.getFullYear(), qStartMonth + 3, 0);
      const qn = Math.floor(qStartMonth / 3) + 1;
      buckets.push({
        start: qStart,
        end: qEnd,
        label: `Q${qn} '${String(qStart.getFullYear()).slice(2)}`,
        months: 3,
        income: 0,
        netWorth: null,
        unrealizedGains: 0,
      });
    }
  } else if (granularity === "ytd") {
    const y = now.getFullYear();
    for (let m = 0; m <= now.getMonth(); m++) {
      buckets.push({
        start: new Date(y, m, 1),
        end: new Date(y, m + 1, 0),
        label: MONTH_LABELS[m],
        months: 1,
        income: 0,
        netWorth: null,
        unrealizedGains: 0,
      });
    }
  } else {
    const count = granularity === "monthly" ? 6 : 12; // monthly = trailing 6mo, 1year = trailing 12mo
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0),
        label: MONTH_LABELS[d.getMonth()],
        months: 1,
        income: 0,
        netWorth: null,
        unrealizedGains: 0,
      });
    }
  }

  return buckets;
}

export function bucketIndexFor(buckets: HistoryBucket[], dateStr: string | null | undefined): number {
  if (!dateStr) return -1;
  const dt = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(dt.getTime())) return -1;
  for (let b = 0; b < buckets.length; b++) {
    if (dt >= buckets[b].start && dt <= buckets[b].end) return b;
  }
  return -1;
}

type WheelPremiumRow = {
  premium: number | string | null;
  contracts: number | string | null;
  entry_date: string | null;
  status: string | null;
  close_price: number | string | null;
  close_date: string | null;
};
type BusinessJobRow = { amount: number | string | null; due_date: string | null; created_at: string | null };
type PositionRow = { price: number | string | null; cost_basis: number | string | null; shares: number | string | null };
type NetWorthSnapshotRow = { snapshot_date: string | null; total_balance: number | string | null };

export async function fetchIncomePremium(
  supabase: SupabaseClient,
  userId: string,
  buckets: HistoryBucket[],
  rangeStart: string
): Promise<void> {
  // Legs entered in range, plus older legs bought back in range (their
  // buy-to-close cost belongs to the close_date bucket).
  const { data } = await supabase
    .from("wheel_trades")
    .select("premium,contracts,entry_date,status,close_price,close_date")
    .eq("user_id", userId)
    .or(`entry_date.gte.${rangeStart},close_date.gte.${rangeStart}`);
  ((data as WheelPremiumRow[]) || []).forEach((r) => {
    const contracts = Number(r.contracts) || 0;
    // Cash basis, same as incomeTable.ts: premium on entry_date, buy-to-close
    // cost ("closed"/"rolled") on close_date -- so a roll shows its net
    // credit/debit in the period it happened, not the new leg's gross premium.
    const entryIdx = bucketIndexFor(buckets, r.entry_date);
    if (entryIdx !== -1) buckets[entryIdx].income += (Number(r.premium) || 0) * contracts * 100;
    if (r.status === "closed" || r.status === "rolled") {
      const closeIdx = bucketIndexFor(buckets, r.close_date || r.entry_date);
      if (closeIdx !== -1) buckets[closeIdx].income -= (Number(r.close_price) || 0) * contracts * 100;
    }
  });
}

export async function fetchIncomeBusiness(
  supabase: SupabaseClient,
  userId: string,
  buckets: HistoryBucket[]
): Promise<void> {
  const { data } = await supabase
    .from("business_jobs")
    .select("amount,due_date,created_at")
    .eq("user_id", userId)
    .eq("status", "completed");
  ((data as BusinessJobRow[]) || []).forEach((r) => {
    const dateStr = r.due_date || (r.created_at ? String(r.created_at).slice(0, 10) : null);
    const idx = bucketIndexFor(buckets, dateStr);
    if (idx === -1) return;
    buckets[idx].income += Number(r.amount) || 0;
  });
}

export async function fetchIncomeMarketGains(
  supabase: SupabaseClient,
  userId: string,
  buckets: HistoryBucket[]
): Promise<void> {
  const { data } = await supabase
    .from("positions")
    .select("price,cost_basis,shares")
    .eq("user_id", userId);
  let gain = 0;
  ((data as PositionRow[]) || []).forEach((r) => {
    if (r.price === null || r.price === undefined || r.cost_basis === null || r.cost_basis === undefined) return;
    gain += (Number(r.price) - Number(r.cost_basis)) * (Number(r.shares) || 0);
  });
  if (buckets.length) {
    // Tracked in unrealizedGains only -- NOT added to `income`. Unrealized
    // mark-to-market gains can reverse before ever being realized (a stock
    // that's up today can be down tomorrow), so they no longer inflate the
    // Income bar or the goal beat/miss comparison; a real position with a
    // large paper gain could otherwise make a user look like they'd
    // massively beaten their income goal for the month when their actual
    // realized income (premium + business) was a small fraction of that.
    // Still surfaced separately in the tooltip so it isn't hidden.
    buckets[buckets.length - 1].unrealizedGains += gain;
  }
}

export async function fetchNetWorthSnapshots(
  supabase: SupabaseClient,
  userId: string,
  buckets: HistoryBucket[],
  rangeStart: string
): Promise<void> {
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select("snapshot_date,total_balance")
    .eq("user_id", userId)
    .gte("snapshot_date", rangeStart)
    .order("snapshot_date", { ascending: true });
  ((data as NetWorthSnapshotRow[]) || []).forEach((r) => {
    const idx = bucketIndexFor(buckets, r.snapshot_date);
    if (idx === -1) return;
    buckets[idx].netWorth = Number(r.total_balance);
  });
}

export async function fetchMonthlyGoal(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from("income_goals")
    .select("monthly_goal")
    .eq("user_id", userId);
  const row = Array.isArray(data) ? data[0] : null;
  return row && row.monthly_goal !== null ? Number(row.monthly_goal) : 0;
}

export async function saveMonthlyGoal(supabase: SupabaseClient, userId: string, newVal: number): Promise<boolean> {
  const { error } = await supabase
    .from("income_goals")
    .upsert(
      { user_id: userId, monthly_goal: newVal, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
  return !error;
}

// Projected-line values: completed buckets ride the actual Income bar tops;
// the current (last) bucket extrapolates income-so-far to the full bucket
// via an elapsed-time-fraction run rate.
export function computeProjected(buckets: HistoryBucket[]): (number | null)[] {
  const lastIdx = buckets.length - 1;
  const now = new Date();
  return buckets.map((b, idx) => {
    if (idx !== lastIdx) return b.income;
    const totalMs = b.end.getTime() - b.start.getTime() + 24 * 60 * 60 * 1000;
    const elapsedMs = now.getTime() - b.start.getTime();
    let fraction = elapsedMs / totalMs;
    if (fraction < 1 / (24 * 60)) fraction = 1 / (24 * 60);
    if (fraction > 1) fraction = 1;
    return b.income / fraction;
  });
}

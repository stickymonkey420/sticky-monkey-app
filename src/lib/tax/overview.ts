import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchW2Jobs } from "@/lib/w2/queries";
import type { W2Job } from "@/lib/w2/types";
import { TAXABLE_ACCOUNT_TYPES, type FilingStatus } from "./data2026";
import type { TaxInput } from "./calc";

// Builds the Taxes Overview from what the member already tracks in the app:
// W-2 jobs (+ last paystub), business & gig income (paid invoices, paid
// class attendees, completed jobs), rentals (rent received minus expenses),
// and realized options P/L in taxable brokerage accounts. Plus manual extras
// saved in tax_profiles. Everything is an ESTIMATE.

export type TaxProfile = {
  filing_status: FilingStatus;
  state: string;
  children: number;
  business_expenses: number;
  stock_short_term: number;
  stock_long_term: number;
  qualified_dividends: number;
  interest_income: number;
  other_income: number;
  extra_pretax: number;
  itemized: number;
  estimates_paid: number;
};

export const DEFAULT_TAX_PROFILE: TaxProfile = {
  filing_status: "single",
  state: "FL",
  children: 0,
  business_expenses: 0,
  stock_short_term: 0,
  stock_long_term: 0,
  qualified_dividends: 0,
  interest_income: 0,
  other_income: 0,
  extra_pretax: 0,
  itemized: 0,
  estimates_paid: 0,
};

export type Pair = { ytd: number; projected: number };

export type W2Source = {
  id: string;
  employer: string;
  hasPaystub: boolean;
  paystubDate: string | null;
  gross: Pair;
  federal: Pair;
  state: Pair;
  pretax: Pair;
};

export type BusinessSource = { id: string; name: string; category: string; income: Pair };

export type TaxOverviewData = {
  year: number;
  monthsElapsed: number;
  profile: TaxProfile;
  w2: W2Source[];
  businesses: BusinessSource[];
  rentalNet: Pair;
  options: Pair;
};

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const PERIOD_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, semimonthly: 365 / 24, monthly: 365 / 12 };

function dayDiff(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function w2Source(job: W2Job, year: number, now: Date): W2Source | null {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const stubDate = job.paystub_date ? new Date(job.paystub_date + "T00:00:00") : null;
  const stubThisYear = !!stubDate && stubDate.getFullYear() === year;

  if (stubThisYear && stubDate) {
    const ended = !job.is_active || (job.end_date && new Date(job.end_date) < yearEnd);
    const remaining = ended ? 0 : Math.max(0, Math.floor(dayDiff(stubDate, yearEnd) / (PERIOD_DAYS[job.pay_frequency] ?? 14)));
    const pair = (line: string): Pair => {
      const ytd = n(job[`ytd_${line}` as keyof W2Job]);
      return { ytd, projected: ytd + n(job[`paystub_${line}` as keyof W2Job]) * remaining };
    };
    return {
      id: job.id,
      employer: job.employer,
      hasPaystub: true,
      paystubDate: job.paystub_date ?? null,
      gross: pair("gross"),
      federal: pair("federal"),
      state: pair("state"),
      pretax: pair("pretax"),
    };
  }

  if (!job.is_active) return null;
  // No paystub yet: prorate salary across the part of the year worked.
  const salary = n(job.annual_salary);
  const start = job.start_date ? new Date(job.start_date + "T00:00:00") : yearStart;
  const from = start > yearStart ? start : yearStart;
  if (from > yearEnd) return null;
  const yearDays = dayDiff(yearStart, yearEnd) + 1;
  const workedSoFar = Math.max(0, dayDiff(from, now < yearEnd ? now : yearEnd));
  const workedFull = Math.max(0, dayDiff(from, yearEnd) + 1);
  const zero = { ytd: 0, projected: 0 };
  return {
    id: job.id,
    employer: job.employer,
    hasPaystub: false,
    paystubDate: null,
    gross: { ytd: (salary * workedSoFar) / yearDays, projected: (salary * workedFull) / yearDays },
    federal: zero,
    state: zero,
    pretax: zero,
  };
}

export async function fetchTaxOverview(supabase: SupabaseClient, userId: string, year: number): Promise<TaxOverviewData> {
  const now = new Date();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const monthsElapsed = now.getFullYear() === year ? Math.max(1, now.getMonth() + 1) : now.getFullYear() > year ? 12 : 1;
  const project = (ytd: number): Pair => ({ ytd, projected: monthsElapsed >= 12 ? ytd : (ytd / monthsElapsed) * 12 });

  const [profileRes, jobs, bizRes, invRes, attRes, bjobRes, ledgerRes, rexpRes, maintRes, wheelRes, longRes] = await Promise.all([
    supabase.from("tax_profiles").select("*").eq("user_id", userId).maybeSingle(),
    fetchW2Jobs(supabase, userId),
    supabase.from("user_businesses").select("id,business_name,category_name").eq("user_id", userId),
    supabase.from("business_invoices").select("business_id,total,status,paid_date").eq("user_id", userId).eq("status", "paid").gte("paid_date", start).lte("paid_date", end),
    supabase.from("business_session_attendees").select("business_id,amount,paid,session_id,business_sessions(start_at)").eq("user_id", userId).eq("paid", true),
    supabase.from("business_jobs").select("business_id,amount,status,due_date,created_at").eq("user_id", userId).eq("status", "completed"),
    supabase.from("rental_ledger").select("amount,kind,entry_date").eq("user_id", userId).eq("kind", "payment").gte("entry_date", start).lte("entry_date", end),
    supabase.from("rental_expenses").select("amount,expense_date").eq("user_id", userId).gte("expense_date", start).lte("expense_date", end),
    supabase.from("rental_maintenance").select("cost,completed_on").eq("user_id", userId).gte("completed_on", start).lte("completed_on", end),
    supabase.from("wheel_trades").select("premium,contracts,status,close_date,exp_date,close_price").eq("user_id", userId).in("account_type", [...TAXABLE_ACCOUNT_TYPES]).neq("status", "open"),
    supabase.from("long_option_trades").select("realized_pl,close_date").eq("user_id", userId).in("account_type", [...TAXABLE_ACCOUNT_TYPES]).eq("status", "closed").gte("close_date", start).lte("close_date", end),
  ]);

  const profile: TaxProfile = { ...DEFAULT_TAX_PROFILE };
  if (profileRes.data) {
    const p = profileRes.data as Record<string, unknown>;
    for (const k of Object.keys(DEFAULT_TAX_PROFILE) as (keyof TaxProfile)[]) {
      if (p[k] == null) continue;
      (profile as Record<string, unknown>)[k] = typeof DEFAULT_TAX_PROFILE[k] === "number" ? n(p[k]) : p[k];
    }
  }

  const w2 = jobs.map((j) => w2Source(j, year, now)).filter((x): x is W2Source => !!x);

  // Business & gig income, per business (cash received this year).
  const bizIncome = new Map<string, number>();
  const add = (id: string | null, amt: number) => {
    if (!id) return;
    bizIncome.set(id, (bizIncome.get(id) ?? 0) + amt);
  };
  for (const r of (invRes.data ?? []) as { business_id: string | null; total: unknown }[]) add(r.business_id, n(r.total));
  for (const r of (attRes.data ?? []) as { business_id: string | null; amount: unknown; business_sessions: { start_at: string } | { start_at: string }[] | null }[]) {
    const sess = Array.isArray(r.business_sessions) ? r.business_sessions[0] : r.business_sessions;
    const d = sess?.start_at?.slice(0, 10);
    if (d && d >= start && d <= end) add(r.business_id, n(r.amount));
  }
  for (const r of (bjobRes.data ?? []) as { business_id: string | null; amount: unknown; due_date: string | null; created_at: string }[]) {
    const d = r.due_date ?? r.created_at.slice(0, 10);
    if (d >= start && d <= end) add(r.business_id, n(r.amount));
  }
  const businesses: BusinessSource[] = ((bizRes.data ?? []) as { id: string; business_name: string | null; category_name: string }[])
    .map((b) => ({ id: b.id, name: b.business_name ?? b.category_name, category: b.category_name, income: project(bizIncome.get(b.id) ?? 0) }))
    .filter((b) => b.income.ytd !== 0);

  const rentIn = ((ledgerRes.data ?? []) as { amount: unknown }[]).reduce((s, r) => s + n(r.amount), 0);
  const rentOut =
    ((rexpRes.data ?? []) as { amount: unknown }[]).reduce((s, r) => s + n(r.amount), 0) +
    ((maintRes.data ?? []) as { cost: unknown }[]).reduce((s, r) => s + n(r.cost), 0);

  let optionsYtd = 0;
  for (const t of (wheelRes.data ?? []) as { premium: unknown; contracts: unknown; status: string; close_date: string | null; exp_date: string | null; close_price: unknown }[]) {
    const d = t.close_date ?? t.exp_date;
    if (!d || d < start || d > end) continue;
    optionsYtd += (t.status === "closed" ? n(t.premium) - n(t.close_price) : n(t.premium)) * n(t.contracts) * 100;
  }
  for (const l of (longRes.data ?? []) as { realized_pl: unknown }[]) optionsYtd += n(l.realized_pl);

  return { year, monthsElapsed, profile, w2, businesses, rentalNet: project(rentIn - rentOut), options: project(optionsYtd) };
}

export function buildTaxInput(d: TaxOverviewData, mode: "ytd" | "projected"): TaxInput {
  const v = (p: Pair) => p[mode];
  const sum = (arr: Pair[]) => arr.reduce((s, p) => s + v(p), 0);
  const p = d.profile;
  return {
    status: p.filing_status,
    state: p.state,
    wages: sum(d.w2.map((w) => w.gross)),
    selfEmployment: sum(d.businesses.map((b) => b.income)) - p.business_expenses,
    shortTermGains: v(d.options) + p.stock_short_term,
    longTermGains: p.stock_long_term,
    qualifiedDividends: p.qualified_dividends,
    interestOrdinaryDividends: p.interest_income,
    otherIncome: v(d.rentalNet) + p.other_income,
    preTaxContributions: sum(d.w2.map((w) => w.pretax)) + p.extra_pretax,
    itemized: p.itemized,
    children: p.children,
    withheld: sum(d.w2.map((w) => w.federal)),
    estimatesPaid: p.estimates_paid,
    stateWithheld: sum(d.w2.map((w) => w.state)),
  };
}

export async function saveTaxProfile(supabase: SupabaseClient, userId: string, profile: TaxProfile) {
  const { error } = await supabase.from("tax_profiles").upsert({ user_id: userId, ...profile, updated_at: new Date().toISOString() });
  if (error) console.error("saveTaxProfile failed", error);
  return { error: error ? error.message : null };
}

// Federal quarterly estimated-tax due dates for the tax year.
export function quarterlyDueDates(year: number): Date[] {
  return [new Date(year, 3, 15), new Date(year, 5, 15), new Date(year, 8, 15), new Date(year + 1, 0, 15)];
}

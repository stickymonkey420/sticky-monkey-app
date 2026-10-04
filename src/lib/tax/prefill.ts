import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchW2Jobs, w2Totals } from "@/lib/w2/queries";
import { TAXABLE_ACCOUNT_TYPES } from "./data2026";

// Pulls what the app already knows for a rough "Fill from my data":
// active W-2 salaries, and this year's realized options P/L in TAXABLE
// (brokerage) accounts only -- IRA/Roth activity isn't taxed yearly.
// Options held < 1 year are short-term gains. Projection annualizes YTD.

export type Prefill = {
  wages: number;
  optionsYtd: number;
  optionsProjected: number;
  monthsElapsed: number;
};

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);

export async function fetchTaxPrefill(supabase: SupabaseClient, userId: string, year: number): Promise<Prefill> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [jobs, wheel, longs] = await Promise.all([
    fetchW2Jobs(supabase, userId),
    supabase
      .from("wheel_trades")
      .select("premium,contracts,status,close_date,exp_date,close_price,account_type")
      .eq("user_id", userId)
      .in("account_type", [...TAXABLE_ACCOUNT_TYPES])
      .neq("status", "open"),
    supabase
      .from("long_option_trades")
      .select("realized_pl,close_date,account_type,status")
      .eq("user_id", userId)
      .in("account_type", [...TAXABLE_ACCOUNT_TYPES])
      .eq("status", "closed")
      .gte("close_date", start)
      .lte("close_date", end),
  ]);

  let optionsYtd = 0;
  for (const t of (wheel.data ?? []) as {
    premium: unknown;
    contracts: unknown;
    status: string;
    close_date: string | null;
    exp_date: string | null;
    close_price: unknown;
  }[]) {
    const d = t.close_date ?? t.exp_date;
    if (!d || d < start || d > end) continue;
    const perShare = t.status === "closed" ? n(t.premium) - n(t.close_price) : n(t.premium);
    optionsYtd += perShare * n(t.contracts) * 100;
  }
  for (const l of (longs.data ?? []) as { realized_pl: unknown }[]) optionsYtd += n(l.realized_pl);

  const now = new Date();
  const monthsElapsed = now.getFullYear() === year ? Math.max(1, now.getMonth() + 1) : now.getFullYear() > year ? 12 : 1;
  return {
    wages: Math.round(w2Totals(jobs).grossAnnual),
    optionsYtd: Math.round(optionsYtd),
    optionsProjected: Math.round((optionsYtd / monthsElapsed) * 12),
    monthsElapsed,
  };
}

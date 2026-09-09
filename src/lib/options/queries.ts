import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AccountTypeOption,
  LeapPosition,
  OpenPosition,
  PremiumSummary,
  WheelPremiumSummaryRow,
  WheelTrade,
} from "./types";
import { EMPTY_PREMIUM_SUMMARY } from "./types";

// Read-only slice ported from the live Webflow Options page's head-code
// script (project doc `claude/roll-positions-options-script.html`):
// open-positions table + per-account premium summary cards. The
// Add/Edit/Roll/Buy-to-Close mutations from that same script are a later
// increment -- everything below only ever reads.

const WHEEL_TRADE_COLUMNS =
  "id,ticker,trade_type,strike,premium,contracts,exp_date,entry_date,account_type,notes,origin_trade_id,status,close_date,close_price";

const LEAP_COLUMNS =
  "id,ticker,strike,avg_cost,contracts,expiration_date,date_bought,account_type,notes,current_price";

export async function fetchOpenWheelTrades(
  supabase: SupabaseClient,
  userId: string,
  accountType: string
): Promise<WheelTrade[]> {
  const { data, error } = await supabase
    .from("wheel_trades")
    .select(WHEEL_TRADE_COLUMNS)
    .eq("user_id", userId)
    .eq("account_type", accountType)
    .eq("status", "open")
    .order("entry_date", { ascending: false });
  return error ? [] : ((data as WheelTrade[]) || []);
}

export async function fetchLeapPositions(
  supabase: SupabaseClient,
  userId: string,
  accountType: string
): Promise<LeapPosition[]> {
  const { data, error } = await supabase
    .from("leap_positions")
    .select(LEAP_COLUMNS)
    .eq("user_id", userId)
    .eq("account_type", accountType)
    .order("date_bought", { ascending: false });
  return error ? [] : ((data as LeapPosition[]) || []);
}

// Matches the script's `account_type_options?select=id,label&wheel_eligible=eq.true&order=label.asc`
// fetch used to populate the Add Trade modal's account dropdown -- reused
// here to drive the tab list instead, so tabs stay in sync with whichever
// accounts are actually wheel-eligible.
export async function fetchAccountTypeOptions(
  supabase: SupabaseClient
): Promise<AccountTypeOption[]> {
  const { data, error } = await supabase
    .from("account_type_options")
    .select("id,label,hint,wheel_eligible")
    .eq("wheel_eligible", true)
    .order("label", { ascending: true });
  return error ? [] : ((data as AccountTypeOption[]) || []);
}

// All wheel_trades rows (every status) for one account -- the premium
// summary needs closed/rolled/expired/assigned rows too, unlike the open
// positions table above.
export async function fetchPremiumSummaryRows(
  supabase: SupabaseClient,
  userId: string,
  accountType: string
): Promise<WheelPremiumSummaryRow[]> {
  const { data, error } = await supabase
    .from("wheel_trades")
    .select("premium,contracts,status,strike,trade_type,entry_date,close_date")
    .eq("user_id", userId)
    .eq("account_type", accountType);
  return error ? [] : ((data as WheelPremiumSummaryRow[]) || []);
}

// Combines an account's open wheel_trades + leap_positions into one
// normalized, sortable row shape -- mirrors the `wheel`/`leaps` mapping,
// concat, and entry-date-desc sort inside loadPositions() in the live
// script. Return % uses the exact same formula as that script's Add/Edit
// Trade modal (premium / strike * 100, not annualized) so the number here
// always matches what was shown/entered when the trade was added.
export function normalizeOpenPositions(
  wheelRows: WheelTrade[],
  leapRows: LeapPosition[]
): OpenPosition[] {
  const wheel: OpenPosition[] = wheelRows.map((r) => {
    const strike = Number(r.strike) || 0;
    const premium = Number(r.premium) || 0;
    const returnPct = strike > 0 ? (premium / strike) * 100 : null;
    return {
      source: "wheel",
      id: r.id,
      ticker: r.ticker,
      type: r.trade_type,
      strike,
      premium,
      contracts: Number(r.contracts) || 0,
      expiration: r.exp_date,
      entryDate: r.entry_date,
      returnPct,
      accountType: r.account_type,
      notes: r.notes,
      originTradeId: r.origin_trade_id,
    };
  });

  const leaps: OpenPosition[] = leapRows.map((r) => ({
    source: "leap",
    id: r.id,
    ticker: r.ticker,
    type: "LEAP",
    strike: Number(r.strike) || 0,
    premium: Number(r.avg_cost) || 0,
    contracts: Number(r.contracts) || 0,
    expiration: r.expiration_date,
    entryDate: r.date_bought,
    returnPct: null,
    accountType: r.account_type,
    notes: r.notes,
    originTradeId: null,
  }));

  return wheel
    .concat(leaps)
    .sort((a, b) => String(b.entryDate || "").localeCompare(String(a.entryDate || "")));
}

// Ported 1:1 from loadPremiumSummary() in the live script -- do not change
// this math without re-checking that script; the accounting rules are also
// documented in the project doc `claude/options-trading-reference.md`:
//   - total: premium on trades ENTERED in the current calendar month/year.
//     Not filtered by status -- premium is collected up front at trade
//     entry for both CSP and CC, so it's correct to count immediately.
//   - realized: premium on trades no longer "open" (expired/assigned/
//     closed/rolled) whose close_date (falling back to entry_date when
//     close_date is null) falls in the current calendar year.
//   - open: premium collected on still-open trades -- "at risk" in the
//     sense that the position could still move against the account before
//     this number is locked in.
//   - capital: capital at risk on open CSPs only -- (strike - premium)
//     per share (the net cash actually on the hook after premium already
//     collected offsets it), times contracts * 100 shares/contract.
export function computePremiumSummary(rows: WheelPremiumSummaryRow[]): PremiumSummary {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const summary: PremiumSummary = { ...EMPTY_PREMIUM_SUMMARY };

  (rows || []).forEach((r) => {
    const premium = Number(r.premium) || 0;
    const contracts = Number(r.contracts) || 0;
    const amt = premium * contracts * 100;

    const entryD = r.entry_date ? new Date(r.entry_date + "T00:00:00") : null;
    if (
      entryD &&
      !Number.isNaN(entryD.getTime()) &&
      entryD.getFullYear() === curYear &&
      entryD.getMonth() === curMonth
    ) {
      summary.total += amt;
    }

    if (r.status === "open") {
      summary.open += amt;
      if (r.trade_type === "CSP") {
        const netStrike = (Number(r.strike) || 0) - premium;
        summary.capital += netStrike * contracts * 100;
      }
    } else {
      const realizedDateStr = r.close_date || r.entry_date;
      const realizedD = realizedDateStr ? new Date(realizedDateStr + "T00:00:00") : null;
      if (realizedD && !Number.isNaN(realizedD.getTime()) && realizedD.getFullYear() === curYear) {
        summary.realized += amt;
      }
    }
  });

  return summary;
}

// Whole calendar days from today to the given date (negative if past).
// Not present in the live script (it has no DTE column), but requested for
// this port's Open Positions table -- straightforward date math, not a
// judgment call about trading-specific accounting.
export function daysToExpiration(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const exp = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(exp.getTime())) return null;
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((exp.getTime() - startToday.getTime()) / (24 * 60 * 60 * 1000));
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "$0.00";
  return (
    "$" +
    Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Same MM/DD/YY format as fmtDate() in the live script.
export function fmtDate(d: string | null): string {
  if (!d) return "—";
  const parts = String(d).slice(0, 10).split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}/${parts[0].slice(2)}` : d;
}

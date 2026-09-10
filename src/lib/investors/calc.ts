import { INVESTOR_POOL_PCT } from "./types";
import type { CapTableEntry } from "./types";

export type OwnerRow = { email: string; firstName: string; lastName: string; ownershipPct: number };

export type PoolSummary = {
  totalConfirmedEquityPct: number; // all confirmed entries (owner + investors) -- trends toward 100%
  poolUsedPct: number; // confirmed, non-owner investor equity -- what the 49% cap actually governs
  poolRemainingPct: number;
  boardSeatsUsed: number; // distinct non-owner emails with a confirmed board-seat entry
  owners: OwnerRow[]; // one row per distinct non-owner investor, equity summed across their entries
};

// Mirrors check_cap_table_limits()'s own grouping logic: "owner" rows are
// identified by email match against profiles.role = 'app_director', the
// exact same join the trigger performs, so these numbers agree with what
// the trigger will actually allow.
export function computePoolSummary(entries: CapTableEntry[], directorEmails: Set<string>): PoolSummary {
  const confirmed = entries.filter((e) => e.status === "confirmed");
  const totalConfirmedEquityPct = confirmed.reduce((sum, e) => sum + Number(e.equity_pct), 0);

  const investorConfirmed = confirmed.filter((e) => !directorEmails.has((e.email || "").toLowerCase()));
  const poolUsedPct = investorConfirmed.reduce((sum, e) => sum + Number(e.equity_pct), 0);
  const poolRemainingPct = INVESTOR_POOL_PCT - poolUsedPct;

  const byEmail = new Map<string, OwnerRow>();
  for (const e of investorConfirmed) {
    const key = (e.email || "").toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.ownershipPct += Number(e.equity_pct);
    } else {
      byEmail.set(key, {
        email: e.email,
        firstName: e.first_name || "",
        lastName: e.last_name || "",
        ownershipPct: Number(e.equity_pct),
      });
    }
  }
  const owners = Array.from(byEmail.values()).sort((a, b) => b.ownershipPct - a.ownershipPct);

  const boardSeatsUsed = investorConfirmed.filter((e) => e.is_board_seat).reduce((set, e) => {
    set.add((e.email || "").toLowerCase());
    return set;
  }, new Set<string>()).size;

  return { totalConfirmedEquityPct, poolUsedPct, poolRemainingPct, boardSeatsUsed, owners };
}

export function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

export function money(n: number | null, currency: string | null): string {
  if (n === null || n === undefined) return "—";
  const cur = currency || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);
  } catch {
    return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

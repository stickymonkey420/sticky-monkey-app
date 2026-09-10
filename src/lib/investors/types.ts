// Port of the live Webflow "Investors" page (page id 6a8c0248de8bad7c888a7fa2).
// This page's own custom code and the site-wide scripts were both empty --
// built directly from the cap_table_entries table's schema, check
// constraints, and (critically) its `check_cap_table_limits()` trigger,
// which is the real, server-enforced source of truth for every business
// rule below. Fetched via Supabase (list_tables/pg_get_constraintdef/
// pg_get_functiondef), not guessed.
export type EntryType = "purchase" | "board_grant";
export type EntryStatus = "pending" | "confirmed" | "cancelled";

export type CapTableEntry = {
  id: string;
  user_id: string;
  entry_type: EntryType;
  equity_pct: number;
  price_paid: number | null;
  currency: string | null;
  acquired_on: string | null;
  lockup_expires_on: string | null;
  status: EntryStatus;
  is_board_seat: boolean;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  first_name: string | null;
  last_name: string | null;
  relationship_to_founder: string | null;
  email: string;
};

// Mirrors check_cap_table_limits() exactly: a 49% pool for non-owner
// investors (the founder/owner's confirmed row is auto-set to the 100%
// remainder, never independently settable), an 8% per-person cap (49% for
// the one named exception written into the trigger itself), and a 7-seat
// board limit. These are display-only mirrors for the summary cards --
// the trigger is what actually enforces them on every insert/update, so
// this UI never needs its own copy of the validation logic, only of the
// numbers worth showing.
export const INVESTOR_POOL_PCT = 49;
export const DEFAULT_INDIVIDUAL_CAP_PCT = 8;
export const BOARD_SEAT_LIMIT = 7;

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  purchase: "Purchase",
  board_grant: "Board Grant",
};

export const STATUS_LABELS: Record<EntryStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

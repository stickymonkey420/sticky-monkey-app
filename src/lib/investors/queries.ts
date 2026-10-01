import type { SupabaseClient } from "@supabase/supabase-js";
import type { CapTableEntry } from "./types";

export type MutationResult = { error: string | null };

export async function fetchMyRole(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return (data as { role: string }).role;
}

// RLS ("cap_table_select_own_or_director") returns only the caller's own
// rows unless they're app_director, in which case it returns every row --
// so fetchAllEntries and fetchMyEntries below both just select "*" and let
// RLS decide the scope, matching cap_table_select_own_or_director exactly.
export async function fetchMyEntries(supabase: SupabaseClient, userId: string): Promise<CapTableEntry[]> {
  const { data, error } = await supabase
    .from("cap_table_entries")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchMyEntries failed", error);
    return [];
  }
  return (data ?? []) as CapTableEntry[];
}

// App Director only in practice: RLS's SELECT policy lets any signed-in
// user through (own-or-director), but a non-director calling this without
// a user_id filter simply gets back only their own row(s) -- there is no
// separate "all entries" grant to bypass.
export async function fetchAllEntries(supabase: SupabaseClient): Promise<CapTableEntry[]> {
  const { data, error } = await supabase.from("cap_table_entries").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("fetchAllEntries failed", error);
    return [];
  }
  return (data ?? []) as CapTableEntry[];
}

// App Director-only in profiles' own RLS -- used to identify which cap
// table rows belong to the owner (matched by email), same join the
// check_cap_table_limits() trigger itself does, so the pool/board-seat
// summary cards agree with what the trigger will actually allow.
export async function fetchDirectorEmails(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("profiles").select("email").eq("role", "app_director");
  if (error || !data) return new Set();
  return new Set((data as { email: string | null }[]).map((r) => (r.email || "").toLowerCase()).filter(Boolean));
}

export type ProfileOption = { id: string; name: string | null; email: string | null };

// For the Add/Edit Entry form's investor picker. cap_table_entries.user_id
// has an ON DELETE RESTRICT foreign key to auth.users, so an entry can
// only ever be recorded against someone who already has an account --
// picking from existing profiles (rather than typing an arbitrary email)
// keeps the form from producing a request the FK would just reject.
export async function fetchProfileOptions(supabase: SupabaseClient): Promise<ProfileOption[]> {
  const { data, error } = await supabase.from("profiles").select("id,name,email").order("name", { ascending: true });
  if (error || !data) return [];
  return data as ProfileOption[];
}

// lockup_expires_on is deliberately absent here -- it's a DB-generated
// column (GENERATED ALWAYS AS (acquired_on + 5 years) STORED), so Postgres
// rejects an insert/update that supplies it at all, even a null. The form
// used to include it and every save failed with "cannot insert a
// non-DEFAULT value into column \"lockup_expires_on\"".
export type CapTableEntryInput = {
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  relationship_to_founder: string | null;
  entry_type: import("./types").EntryType;
  equity_pct: number;
  price_paid: number | null;
  currency: string | null;
  acquired_on: string | null;
  status: import("./types").EntryStatus;
  is_board_seat: boolean;
  notes: string | null;
  individual_cap_override: number | null;
};

// Insert/update both surface the raw Postgres error message on failure --
// check_cap_table_limits() raises specific, already-user-readable
// exceptions ("...exceeding the 49 percent investor pool", "...exceeding
// the 7-seat cap", etc.), so this deliberately does not re-validate those
// rules client-side; the trigger is the single source of truth.
export async function addCapTableEntry(
  supabase: SupabaseClient,
  recordedBy: string,
  input: CapTableEntryInput
): Promise<MutationResult> {
  const { error } = await supabase.from("cap_table_entries").insert({ ...input, recorded_by: recordedBy });
  return { error: error ? error.message : null };
}

export async function updateCapTableEntry(
  supabase: SupabaseClient,
  id: string,
  input: Partial<CapTableEntryInput>
): Promise<MutationResult> {
  const { error } = await supabase.from("cap_table_entries").update(input).eq("id", id);
  return { error: error ? error.message : null };
}

export async function deleteCapTableEntry(supabase: SupabaseClient, id: string): Promise<MutationResult> {
  const { error } = await supabase.from("cap_table_entries").delete().eq("id", id);
  return { error: error ? error.message : null };
}

// ---- Company valuation (company_settings, single row id=true) ----
// SELECT: app_director or anyone with a cap_table_entries row.
// UPDATE: app_director only (RLS company_settings_update_director).
export type CompanyLimits = {
  investor_pool_pct: number;
  individual_cap_pct: number;
  board_seat_limit: number;
  board_only: boolean;
};
export type CompanySettings = CompanyLimits & { valuation: number; total_shares: number; updated_at: string | null };
export type CompanySettingsInput = CompanyLimits & { valuation: number; total_shares: number };

export async function fetchCompanySettings(supabase: SupabaseClient): Promise<CompanySettings | null> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("valuation,total_shares,updated_at,investor_pool_pct,individual_cap_pct,board_seat_limit,board_only")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("fetchCompanySettings failed", error);
    return null;
  }
  const d = data as Record<string, unknown>;
  return {
    valuation: Number(d.valuation),
    total_shares: Number(d.total_shares),
    updated_at: (d.updated_at as string | null) ?? null,
    investor_pool_pct: Number(d.investor_pool_pct ?? 49),
    individual_cap_pct: Number(d.individual_cap_pct ?? 8),
    board_seat_limit: Number(d.board_seat_limit ?? 7),
    board_only: d.board_only !== false,
  };
}

export async function updateCompanySettings(
  supabase: SupabaseClient,
  userId: string,
  input: CompanySettingsInput
): Promise<MutationResult> {
  const { error } = await supabase
    .from("company_settings")
    .update({ ...input, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", true);
  return { error: error ? error.message : null };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RentalData } from "./types";

export const EMPTY_RENTAL_DATA: RentalData = {
  properties: [],
  units: [],
  leases: [],
  ledger: [],
  maintenance: [],
  expenses: [],
};

export type RentalTable =
  | "rental_properties"
  | "rental_units"
  | "rental_leases"
  | "rental_ledger"
  | "rental_maintenance"
  | "rental_expenses";

// Loads everything under one business in six parallel reads. Child tables
// are scoped by the parent ids of this business (RLS already limits every
// read to the signed-in member's own rows). A small landlord has at most a
// few hundred rows here, so one round trip beats paging.
export async function fetchRentalData(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ data: RentalData; error: string | null }> {
  const { data: properties, error: pErr } = await supabase
    .from("rental_properties")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (pErr) return { data: EMPTY_RENTAL_DATA, error: pErr.message };
  const propIds = (properties ?? []).map((p) => p.id as string);
  if (propIds.length === 0)
    return { data: { ...EMPTY_RENTAL_DATA, properties: [] }, error: null };

  const [{ data: units, error: uErr }, { data: expenses, error: eErr }] =
    await Promise.all([
      supabase
        .from("rental_units")
        .select("*")
        .in("property_id", propIds)
        .order("label", { ascending: true }),
      supabase
        .from("rental_expenses")
        .select("*")
        .in("property_id", propIds)
        .order("expense_date", { ascending: false }),
    ]);
  if (uErr || eErr)
    return { data: EMPTY_RENTAL_DATA, error: (uErr || eErr)!.message };
  const unitIds = (units ?? []).map((u) => u.id as string);

  let leases: RentalData["leases"] = [];
  let maintenance: RentalData["maintenance"] = [];
  let ledger: RentalData["ledger"] = [];
  if (unitIds.length > 0) {
    const [{ data: l, error: lErr }, { data: m, error: mErr }] =
      await Promise.all([
        supabase
          .from("rental_leases")
          .select("*")
          .in("unit_id", unitIds)
          .order("start_date", { ascending: false }),
        supabase
          .from("rental_maintenance")
          .select("*")
          .in("unit_id", unitIds)
          .order("opened_on", { ascending: false }),
      ]);
    if (lErr || mErr)
      return { data: EMPTY_RENTAL_DATA, error: (lErr || mErr)!.message };
    leases = (l ?? []) as RentalData["leases"];
    maintenance = (m ?? []) as RentalData["maintenance"];
    const leaseIds = leases.map((x) => x.id);
    if (leaseIds.length > 0) {
      const { data: g, error: gErr } = await supabase
        .from("rental_ledger")
        .select("*")
        .in("lease_id", leaseIds)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (gErr) return { data: EMPTY_RENTAL_DATA, error: gErr.message };
      ledger = (g ?? []) as RentalData["ledger"];
    }
  }

  return {
    data: {
      properties: (properties ?? []) as RentalData["properties"],
      units: (units ?? []) as RentalData["units"],
      leases,
      ledger,
      maintenance,
      expenses: (expenses ?? []) as RentalData["expenses"],
    },
    error: null,
  };
}

export async function insertRows<T>(
  supabase: SupabaseClient,
  table: RentalTable,
  rows: Record<string, unknown>[],
): Promise<{ rows: T[]; error: string | null }> {
  if (rows.length === 0) return { rows: [], error: null };
  const { data, error } = await supabase.from(table).insert(rows).select("*");
  if (error) {
    console.error(`insert ${table} failed`, error);
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as T[], error: null };
}

export async function updateRow<T>(
  supabase: SupabaseClient,
  table: RentalTable,
  id: string,
  patch: Record<string, unknown>,
): Promise<{ row: T | null; error: string | null }> {
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    console.error(`update ${table} failed`, error);
    return { row: null, error: error.message };
  }
  return { row: data as T, error: null };
}

export async function deleteRow(
  supabase: SupabaseClient,
  table: RentalTable,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    console.error(`delete ${table} failed`, error);
    return { error: error.message };
  }
  return { error: null };
}

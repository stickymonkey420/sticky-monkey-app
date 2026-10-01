import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItAsset, ItContract, ItPart, ItSite, ItTicket, ItTimeEntry } from "./itTypes";
import type { BusinessInvoice, BusinessInvoiceLine } from "./invoiceTypes";

// Data layer for IT / Tech Support businesses. All calls run as the
// signed-in user; owner-only RLS on every table.

export async function fetchItWorkspace(supabase: SupabaseClient, businessId: string) {
  const [tickets, sites, contracts, assets, invoices, biz] = await Promise.all([
    supabase.from("it_tickets").select("*").eq("business_id", businessId).order("opened_at", { ascending: false }),
    supabase.from("it_sites").select("*").eq("business_id", businessId).order("name"),
    supabase.from("it_contracts").select("*").eq("business_id", businessId).order("created_at"),
    supabase.from("it_assets").select("*").eq("business_id", businessId).order("name"),
    supabase.from("business_invoices").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.from("user_businesses").select("default_hourly_rate").eq("id", businessId).maybeSingle(),
  ]);
  const ticketIds = (tickets.data ?? []).map((t) => t.id as string);
  const invoiceIds = (invoices.data ?? []).map((i) => i.id as string);
  const [time, parts, lines] = await Promise.all([
    ticketIds.length
      ? supabase.from("it_time_entries").select("*").in("ticket_id", ticketIds).order("work_date", { ascending: false }).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    ticketIds.length ? supabase.from("it_ticket_parts").select("*").in("ticket_id", ticketIds).order("created_at") : Promise.resolve({ data: [] }),
    invoiceIds.length
      ? supabase.from("business_invoice_lines").select("*").in("invoice_id", invoiceIds).order("sort_order")
      : Promise.resolve({ data: [] }),
  ]);
  return {
    tickets: (tickets.data ?? []) as ItTicket[],
    sites: (sites.data ?? []) as ItSite[],
    contracts: (contracts.data ?? []) as ItContract[],
    assets: (assets.data ?? []) as ItAsset[],
    time: (time.data ?? []) as ItTimeEntry[],
    parts: (parts.data ?? []) as ItPart[],
    invoices: (invoices.data ?? []) as BusinessInvoice[],
    lines: (lines.data ?? []) as BusinessInvoiceLine[],
    defaultRate: biz.data?.default_hourly_rate == null ? null : Number(biz.data.default_hourly_rate),
  };
}

type Res<T> = { data: T | null; error: string | null };
async function run<T>(label: string, p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Res<T>> {
  const { data, error } = await p;
  if (error) {
    console.error(`${label} failed`, error);
    return { data: null, error: error.message };
  }
  return { data: data as T, error: null };
}

// Generic insert / update / delete for the it_* tables (all owner-scoped).
type ItTable = "it_tickets" | "it_sites" | "it_contracts" | "it_assets" | "it_time_entries" | "it_ticket_parts";

export function itInsert<T>(supabase: SupabaseClient, table: ItTable, row: Record<string, unknown>) {
  return run<T>(`insert ${table}`, supabase.from(table).insert(row).select("*").single());
}
export function itUpdate<T>(supabase: SupabaseClient, table: ItTable, id: string, patch: Record<string, unknown>) {
  return run<T>(`update ${table}`, supabase.from(table).update(patch).eq("id", id).select("*").single());
}
export async function itDelete(supabase: SupabaseClient, table: ItTable, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) console.error(`delete ${table} failed`, error);
  return { error: error ? error.message : null };
}

export async function setDefaultHourlyRate(supabase: SupabaseClient, businessId: string, rate: number | null) {
  const { error } = await supabase.from("user_businesses").update({ default_hourly_rate: rate }).eq("id", businessId);
  return { error: error ? error.message : null };
}

export async function createItInvoice(
  supabase: SupabaseClient,
  input: { businessId: string; clientId: string | null; timeIds: string[]; partIds: string[]; dueDate: string | null; notes: string | null }
): Promise<Res<string>> {
  return run<string>(
    "createItInvoice",
    supabase.rpc("create_it_invoice", {
      p_business_id: input.businessId,
      p_client_id: input.clientId,
      p_time_ids: input.timeIds,
      p_part_ids: input.partIds,
      p_due_date: input.dueDate,
      p_notes: input.notes,
    })
  );
}

export type { ItAsset, ItContract, ItPart, ItSite, ItTicket, ItTimeEntry };

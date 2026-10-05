import type { SupabaseClient } from "@supabase/supabase-js";
import { rowFields, type GigCollection, type RecordData } from "./schema";

export type GigRecord = {
  id: string;
  business_id: string;
  collection: string;
  data: RecordData;
  status: string | null;
  record_date: string | null;
  income: number;
  expense: number;
  external_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type GigIntegrationRow = {
  id: string;
  business_id: string;
  provider: string;
  webhook_token: string;
  settings: Record<string, unknown>;
  status: string;
  last_event_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
};

function normalize(r: Record<string, unknown>): GigRecord {
  return { ...(r as GigRecord), income: Number(r.income) || 0, expense: Number(r.expense) || 0, data: (r.data as RecordData) ?? {} };
}

// All records for one business (paged past the 1,000-row API cap).
export async function fetchGigRecords(supabase: SupabaseClient, businessId: string): Promise<GigRecord[]> {
  const out: GigRecord[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await supabase
      .from("gig_records")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out.push(normalize(r));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function insertGigRecord(
  supabase: SupabaseClient,
  userId: string,
  businessId: string,
  col: GigCollection,
  data: RecordData,
  extra?: { external_id?: string | null; source?: string }
): Promise<GigRecord> {
  const { data: row, error } = await supabase
    .from("gig_records")
    .insert({
      user_id: userId,
      business_id: businessId,
      collection: col.key,
      data,
      ...rowFields(col, data),
      external_id: extra?.external_id ?? null,
      source: extra?.source ?? "manual",
    })
    .select("*")
    .single();
  if (error || !row) throw new Error(error?.message ?? "Insert failed");
  return normalize(row);
}

export async function updateGigRecord(supabase: SupabaseClient, col: GigCollection, id: string, data: RecordData, externalId?: string | null): Promise<GigRecord> {
  const patch: Record<string, unknown> = { data, ...rowFields(col, data), updated_at: new Date().toISOString() };
  if (externalId !== undefined) patch.external_id = externalId;
  const { data: row, error } = await supabase.from("gig_records").update(patch).eq("id", id).select("*").single();
  if (error || !row) throw new Error(error?.message ?? "Update failed");
  return normalize(row);
}

export async function deleteGigRecord(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("gig_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Checklist progress lives in one "_checklist" record per business (not a real collection).
const CHECKLIST: GigCollection = { key: "_checklist", label: "Checklist", singular: "Checklist", titleField: "x", fields: [] };
export async function saveChecklist(supabase: SupabaseClient, userId: string, businessId: string, existing: GigRecord | null, done: Record<string, boolean>): Promise<GigRecord> {
  return existing ? updateGigRecord(supabase, CHECKLIST, existing.id, { done }) : insertGigRecord(supabase, userId, businessId, CHECKLIST, { done });
}

export async function fetchGigIntegrations(supabase: SupabaseClient, businessId: string): Promise<GigIntegrationRow[]> {
  const { data } = await supabase.from("gig_integrations").select("id,business_id,provider,webhook_token,settings,status,last_event_at,last_sync_at,last_error").eq("business_id", businessId);
  return (data ?? []) as GigIntegrationRow[];
}

// Calls the server route that holds the secret-bearing integration logic.
export async function gigIntegrationAction(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    const res = await fetch("/api/gig/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    return res.ok ? { ok: true, message: j?.message } : { ok: false, error: j?.error || `Request failed (${res.status})` };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

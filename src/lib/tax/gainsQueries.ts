import type { SupabaseClient } from "@supabase/supabase-js";
import type { GainSource, ParsedGain } from "./gainsImport";

export type RealizedGainRow = ParsedGain & {
  id: string;
  source: GainSource;
  import_batch: string;
  file_name: string | null;
  created_at: string;
};

// PostgREST caps every response at 1,000 rows, so page through with range().
export async function fetchGainRows<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  columns: string,
  from: string,
  to: string,
  userId?: string
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let offset = 0; offset < 100_000; offset += PAGE) {
    let q = supabase.from("realized_gains").select(columns).gte("date_sold", from).lte("date_sold", to);
    if (userId) q = q.eq("user_id", userId);
    const { data, error } = await q.order("date_sold", { ascending: false }).order("id").range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// Which of these fingerprints are already saved for this member (RLS-scoped).
export async function existingKeys(supabase: SupabaseClient, keys: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(keys, 150)) {
    const { data, error } = await supabase.from("realized_gains").select("dedupe_key").in("dedupe_key", part);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { dedupe_key: string }[]) found.add(r.dedupe_key);
  }
  return found;
}

// Inserts only new rows; duplicates are skipped by the unique index
// (user_id, dedupe_key) -- safe even if two imports race.
export async function importGains(
  supabase: SupabaseClient,
  userId: string,
  source: GainSource,
  fileName: string,
  gains: ParsedGain[]
): Promise<{ inserted: number; error: string | null }> {
  const batch = crypto.randomUUID();
  let inserted = 0;
  for (const part of chunk(gains, 400)) {
    const rows = part.map((g) => ({ ...g, user_id: userId, source, import_batch: batch, file_name: fileName.slice(0, 200) }));
    const { data, error } = await supabase
      .from("realized_gains")
      .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("importGains failed", error);
      return { inserted, error: error.message };
    }
    inserted += data?.length ?? 0;
  }
  return { inserted, error: null };
}

export async function fetchGains(supabase: SupabaseClient, year: number): Promise<RealizedGainRow[]> {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = await fetchGainRows(supabase, "*", `${year}-01-01`, `${year}-12-31`);
  } catch (e) {
    console.error("fetchGains failed", e);
    return [];
  }
  return rows.map((r) => ({
    ...(r as RealizedGainRow),
    proceeds: Number(r.proceeds),
    cost_basis: Number(r.cost_basis),
    wash_sale: Number(r.wash_sale),
    gain: Number(r.gain),
    quantity: r.quantity == null ? null : Number(r.quantity),
  }));
}

export async function deleteBatch(supabase: SupabaseClient, batch: string) {
  const { error } = await supabase.from("realized_gains").delete().eq("import_batch", batch);
  return { error: error ? error.message : null };
}

export async function deleteGain(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("realized_gains").delete().eq("id", id);
  return { error: error ? error.message : null };
}

export type GainTotals = { short: number; long: number; shortOptions: number; longOptions: number; count: number };

export function totalGains(rows: Pick<ParsedGain, "gain" | "term" | "is_option">[]): GainTotals {
  const t: GainTotals = { short: 0, long: 0, shortOptions: 0, longOptions: 0, count: rows.length };
  for (const r of rows) {
    if (r.term === "long") {
      t.long += r.gain;
      if (r.is_option) t.longOptions += r.gain;
    } else {
      t.short += r.gain;
      if (r.is_option) t.shortOptions += r.gain;
    }
  }
  return t;
}

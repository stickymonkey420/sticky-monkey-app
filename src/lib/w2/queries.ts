import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKS_PER_YEAR, W2_CHANGED_EVENT, type W2Job, type W2JobInput } from "./types";

function num(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchW2Jobs(supabase: SupabaseClient, userId: string): Promise<W2Job[]> {
  const { data, error } = await supabase
    .from("w2_jobs")
    .select("*")
    .eq("user_id", userId)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchW2Jobs failed", error);
    return [];
  }
  return (data ?? []) as W2Job[];
}

export async function saveW2Job(
  supabase: SupabaseClient,
  userId: string,
  input: W2JobInput,
  id?: string,
): Promise<{ error: string | null }> {
  const row = { ...input, updated_at: new Date().toISOString() };
  const { error } = id
    ? await supabase.from("w2_jobs").update(row).eq("id", id)
    : await supabase.from("w2_jobs").insert({ ...row, user_id: userId });
  if (error) {
    console.error("saveW2Job failed", error);
    return { error: error.message };
  }
  notifyW2Changed();
  return { error: null };
}

export async function deleteW2Job(supabase: SupabaseClient, id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("w2_jobs").delete().eq("id", id);
  if (error) return { error: error.message };
  notifyW2Changed();
  return { error: null };
}

export function notifyW2Changed() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(W2_CHANGED_EVENT));
}

export type W2Figures = {
  checksPerYear: number;
  grossPerCheck: number;
  netPerCheck: number | null;
  netAnnual: number | null;
  netMonthly: number | null;
  takeHomePct: number | null; // net / gross
};

export function w2Figures(job: Pick<W2Job, "annual_salary" | "pay_frequency" | "net_per_check">): W2Figures {
  const checks = CHECKS_PER_YEAR[job.pay_frequency] ?? 26;
  const annual = num(job.annual_salary);
  const net = job.net_per_check == null || job.net_per_check === "" ? null : num(job.net_per_check);
  const netAnnual = net == null ? null : net * checks;
  return {
    checksPerYear: checks,
    grossPerCheck: annual / checks,
    netPerCheck: net,
    netAnnual,
    netMonthly: netAnnual == null ? null : netAnnual / 12,
    takeHomePct: netAnnual == null || annual <= 0 ? null : netAnnual / annual,
  };
}

export function w2Totals(jobs: W2Job[]) {
  const active = jobs.filter((j) => j.is_active);
  let grossAnnual = 0;
  let netAnnual = 0;
  let netKnown = true;
  for (const j of active) {
    const f = w2Figures(j);
    grossAnnual += num(j.annual_salary);
    if (f.netAnnual == null) netKnown = false;
    else netAnnual += f.netAnnual;
  }
  return {
    activeCount: active.length,
    grossAnnual,
    grossMonthly: grossAnnual / 12,
    netAnnual: netKnown ? netAnnual : null,
    netMonthly: netKnown ? netAnnual / 12 : null,
  };
}

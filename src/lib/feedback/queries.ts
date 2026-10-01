import type { SupabaseClient } from "@supabase/supabase-js";
import type { BusinessFeedback, FeedbackKind, FeedbackStatus, Impact, Urgency } from "./types";

export type FeedbackInput = {
  business_id: string | null;
  business_name: string | null;
  category_name: string | null;
  kind: FeedbackKind;
  area: string | null;
  title: string;
  details: string | null;
  steps_to_reproduce: string | null;
  user_urgency: Urgency;
  user_impact: Impact;
};

export type TriagePatch = Partial<{
  status: FeedbackStatus;
  priority_weight: number | null;
  tags: string[];
  director_notes: string | null;
  response: string | null;
}>;

// RLS scopes this: a submitter gets their own rows, app_director gets all.
export async function fetchFeedback(supabase: SupabaseClient, opts: { businessId?: string; mineOnly?: string } = {}) {
  let q = supabase.from("business_feedback").select("*").order("created_at", { ascending: false }).limit(500);
  if (opts.businessId) q = q.eq("business_id", opts.businessId);
  if (opts.mineOnly) q = q.eq("user_id", opts.mineOnly);
  const { data, error } = await q;
  if (error) {
    console.error("fetchFeedback failed", error);
    return [] as BusinessFeedback[];
  }
  return (data ?? []) as BusinessFeedback[];
}

export async function submitFeedback(supabase: SupabaseClient, userId: string, input: FeedbackInput) {
  const { error } = await supabase.from("business_feedback").insert({
    ...input,
    user_id: userId,
    page_path: typeof window !== "undefined" ? window.location.pathname : null,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) console.error("submitFeedback failed", error);
  return { error: error ? error.message : null };
}

export async function updateFeedback(supabase: SupabaseClient, id: string, patch: TriagePatch) {
  const { data, error } = await supabase.from("business_feedback").update(patch).eq("id", id).select("*").single();
  if (error) console.error("updateFeedback failed", error);
  return { data: (data as BusinessFeedback | null) ?? null, error: error ? error.message : null };
}

export async function deleteFeedback(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("business_feedback").delete().eq("id", id);
  if (error) console.error("deleteFeedback failed", error);
  return { error: error ? error.message : null };
}

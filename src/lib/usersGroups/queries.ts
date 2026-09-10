import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Role } from "./types";

const PROFILE_COLUMNS =
  "id,name,email,role,is_demo,created_at,use_cases,onboarding_survey,onboarding_completed_at,username,date_of_birth,present_address,permanent_address,postal_code,avatar_url,account_types";

export type MutationResult = { error: string | null };

// Ordered oldest-first, matching the live script's
// `order=created_at.asc`. RLS already scopes which rows come back (app
// director sees everyone; support/developer see only paid/free profiles;
// see the "profiles" table policies) -- no client-side filtering needed.
export async function fetchProfiles(supabase: SupabaseClient): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("fetchProfiles failed", error);
    return [];
  }
  return (data ?? []) as unknown as Profile[];
}

export async function fetchMyRole(supabase: SupabaseClient, userId: string): Promise<Role | null> {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return (data as { role: Role }).role;
}

// Inline row Save: name/role/is_demo only, matching the live script's
// saveRow(). RLS enforces who may set which role (Support/Developer can
// only ever land on paid/free, same as the disabled-when-not-app_director
// <select> in the UI).
export async function saveProfileRow(
  supabase: SupabaseClient,
  id: string,
  changes: { name?: string; role?: Role; is_demo?: boolean }
): Promise<MutationResult> {
  const { error } = await supabase.from("profiles").update(changes).eq("id", id);
  return { error: error ? error.message : null };
}

export type ProfileDetailsInput = {
  name: string;
  username: string | null;
  email: string;
  date_of_birth: string | null;
  present_address: string | null;
  permanent_address: string | null;
  postal_code: string | null;
  avatar_url: string | null;
  account_types: string[];
};

export async function saveProfileDetails(
  supabase: SupabaseClient,
  id: string,
  input: ProfileDetailsInput
): Promise<MutationResult> {
  const { error } = await supabase.from("profiles").update(input).eq("id", id);
  return { error: error ? error.message : null };
}

export type SurveyInput = {
  use_cases: string[] | null;
  onboarding_survey: Record<string, unknown>;
  retake: boolean;
};

export async function saveSurvey(supabase: SupabaseClient, id: string, input: SurveyInput): Promise<MutationResult> {
  const payload: Record<string, unknown> = {
    use_cases: input.use_cases,
    onboarding_survey: input.onboarding_survey,
  };
  if (input.retake) payload.onboarding_completed_at = null;
  const { error } = await supabase.from("profiles").update(payload).eq("id", id);
  return { error: error ? error.message : null };
}

// App Director only (enforced by RLS) -- deletes the profile row. The live
// script's own confirm copy warns this also removes the account's trades/
// positions/LEAPs, implying an ON DELETE CASCADE from those tables to
// profiles.id, which this port relies on rather than re-implements.
export async function deleteProfile(supabase: SupabaseClient, id: string): Promise<MutationResult> {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  return { error: error ? error.message : null };
}

// Same Supabase Auth recovery flow as the standalone forgot-password page
// -- an admin-initiated send of the same reset email a user could request
// themselves, not a privileged bypass.
export async function sendPasswordReset(supabase: SupabaseClient, email: string): Promise<MutationResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
  });
  return { error: error ? error.message : null };
}

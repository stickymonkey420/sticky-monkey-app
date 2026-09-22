import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, Role } from "./types";

const PROFILE_COLUMNS =
  "id,name,email,role,is_demo,created_at,use_cases,onboarding_survey,onboarding_completed_at,username,date_of_birth,present_address,permanent_address,postal_code,avatar_url,account_types,x_handle";

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
  // Wrapped in try/catch on purpose: an unhandled throw here (as opposed to
  // a normal Postgrest {error} response) would previously escape as an
  // unhandled promise rejection -- no network request even goes out, no
  // status message shows, and the row's "Saving..." state can get stuck --
  // which reads exactly like "I clicked Save and nothing happened."
  try {
    // The actual demo dataset is only ever fabricated by a seed routine --
    // originally that only ran at the *target* account's own next sign-in
    // (reset_demo_data_if_needed(), keyed off auth.uid()), so ticking Demo
    // for someone else here and saving silently did nothing visible until
    // they happened to log out and back in. Detect the false -> true
    // transition and seed immediately via the admin-parameterized RPC
    // instead, so Save is the moment the account actually gets data.
    let seedTransition = false;
    if (changes.is_demo === true) {
      const { data: before } = await supabase.from("profiles").select("is_demo").eq("id", id).maybeSingle();
      seedTransition = !(before as { is_demo?: boolean } | null)?.is_demo;
    }

    const { error } = await supabase.from("profiles").update(changes).eq("id", id);
    if (error) return { error: error.message };

    if (seedTransition) {
      const { error: seedError } = await supabase.rpc("admin_seed_demo_data", { target_id: id });
      if (seedError) {
        console.error("admin_seed_demo_data failed", seedError);
        return { error: `Saved, but seeding demo data failed: ${seedError.message}` };
      }
    }

    return { error: null };
  } catch (err) {
    console.error("saveProfileRow threw", err);
    return { error: err instanceof Error ? err.message : "Unexpected error saving changes." };
  }
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
  x_handle: string | null;
};

export async function saveProfileDetails(
  supabase: SupabaseClient,
  id: string,
  input: ProfileDetailsInput
): Promise<MutationResult> {
  const { error } = await supabase.from("profiles").update(input).eq("id", id);
  return { error: error ? error.message : null };
}

// Narrow update used by the avatar upload flow in MyProfileModal -- saves
// immediately after a successful storage upload (or removal) rather than
// waiting for the surrounding form's "Save Changes", and never touches any
// other column.
export async function updateAvatarUrl(
  supabase: SupabaseClient,
  id: string,
  avatarUrl: string | null
): Promise<MutationResult> {
  const { error } = await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", id);
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

// Full account purge, via the /api/admin/delete-account route -- NOT a
// direct `profiles` delete. Deleting only the profile row (the old
// behavior) left the actual Supabase Auth user (auth.users) intact, so a
// "deleted" member could still sign in with no profile -- a phantom
// account. The API route uses the Supabase service-role key (required:
// never available to this RLS-scoped client) to remove the real auth user,
// which cascades to profiles, trades, positions, LEAPs, portfolio history,
// and everything else via ON DELETE CASCADE. See that route for the
// handful of non-cascading exceptions it handles explicitly.
export async function deleteAccount(id: string): Promise<MutationResult> {
  try {
    const res = await fetch("/api/admin/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { error: body.error || "Could not delete this account." };
    }
    return { error: null };
  } catch {
    return { error: "Could not delete this account." };
  }
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

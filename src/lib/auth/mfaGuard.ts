import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side check for App Director actions: the session must be verified
// with two-factor (AAL2). A stolen password alone (AAL1) can't run them.
// Returns an error message, or null when the session is AAL2.
export async function directorAal2Error(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return "Couldn't verify two-factor status. Reload and try again.";
  return data.currentLevel === "aal2" ? null : "Two-factor verification required. Reload the app and enter your authenticator code.";
}

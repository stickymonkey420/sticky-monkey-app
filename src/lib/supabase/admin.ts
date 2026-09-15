import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase client -- bypasses RLS entirely. SERVER-ONLY: never
// import this from a Client Component, or anything that could end up in a
// browser bundle. The service role key must never reach the browser.
//
// Used for privileged operations the normal anon/RLS-scoped client can
// never do -- e.g. auth.admin.deleteUser() in
// src/app/api/admin/delete-account/route.ts. Deleting from `profiles`
// alone (the old flow) never touched the actual Supabase Auth user, which
// is why a "deleted" account could still log in.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the server environment (Supabase
// Dashboard -> Project Settings -> API -> service_role secret). Set it in
// .env.local for local dev and in Vercel's project environment variables
// for production -- WITHOUT a NEXT_PUBLIC_ prefix, or it would ship to
// every visitor's browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set SUPABASE_SERVICE_ROLE_KEY in your server environment (Supabase Dashboard > Settings > API > service_role secret) -- never with a NEXT_PUBLIC_ prefix."
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SecretStatus } from "./types";

// Both edge functions enforce their own role check (app_director/support/
// developer) server-side and never return a stored secret's actual value --
// list-app-secrets returns only {key, is_set, updated_at} per key, and
// update-app-secret is write-only. Called directly via fetch() with the
// user's access token, same convention as lib/screener/queries.ts's
// fetchTickerQuote, since these aren't PostgREST table calls.

export type ListSecretsResult = { ok: true; secrets: SecretStatus[] } | { ok: false; kind: "forbidden" | "failed" };

export async function fetchSecretStatuses(supabase: SupabaseClient): Promise<ListSecretsResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, kind: "failed" };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${base}/functions/v1/list-app-secrets`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 403) return { ok: false, kind: "forbidden" };
    if (!res.ok) return { ok: false, kind: "failed" };
    const body = await res.json();
    return { ok: true, secrets: (body?.secrets ?? []) as SecretStatus[] };
  } catch (e) {
    console.error("fetchSecretStatuses failed", e);
    return { ok: false, kind: "failed" };
  }
}

export type UpdateSecretResult = { ok: true } | { ok: false; kind: "forbidden" | "invalid" | "failed" };

export async function updateSecret(supabase: SupabaseClient, key: string, value: string): Promise<UpdateSecretResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { ok: false, kind: "failed" };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  try {
    const res = await fetch(`${base}/functions/v1/update-app-secret`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ key, value }),
    });
    if (res.status === 403) return { ok: false, kind: "forbidden" };
    if (res.status === 400) return { ok: false, kind: "invalid" };
    if (!res.ok) return { ok: false, kind: "failed" };
    return { ok: true };
  } catch (e) {
    console.error("updateSecret failed", e);
    return { ok: false, kind: "failed" };
  }
}

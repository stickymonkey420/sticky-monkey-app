// Port of the live Webflow "Update API Key" admin page (page id
// 6a8473633590940db9b55561). The page's own custom code was empty, but two
// Supabase edge functions back it exactly: list-app-secrets (read-only
// status, never returns values) and update-app-secret (write-only,
// allowlisted keys only). Both already enforce their own
// app_director/support/developer role check server-side.
export type ApiKeyDef = { key: string; label: string };

// Matches ALLOWED_KEYS in both edge functions, in the same order the live
// page's dropdown listed them (per the WebFetch of the static page).
export const API_KEY_DEFS: ApiKeyDef[] = [
  { key: "plaid_client_id", label: "Plaid Client ID" },
  { key: "plaid_secret", label: "Plaid Secret" },
  { key: "plaid_env", label: "Plaid Environment (sandbox/production)" },
  { key: "internal_fn_secret", label: "Internal Function Secret" },
  { key: "finnhub_api_key", label: "Finnhub API Key" },
  { key: "alphavantage_api_key", label: "Alpha Vantage API Key" },
  { key: "twelvedata_api_key", label: "Twelve Data API Key" },
  { key: "anthropic_api_key", label: "Anthropic API Key (for Abu)" },
  { key: "google_tts_api_key", label: "Google TTS API Key" },
];

export type SecretStatus = { key: string; is_set: boolean; updated_at: string | null };

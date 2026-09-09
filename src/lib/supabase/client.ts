import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (the browser).
 * Reads session from cookies set by the server client / middleware, so
 * auth state stays in sync between server-rendered and client-rendered code.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

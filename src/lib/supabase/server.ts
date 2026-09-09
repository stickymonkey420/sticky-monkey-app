import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the auth session via Next.js's cookie store so a
 * user's sign-in persists across server-rendered navigations.
 *
 * NOTE: this must be created fresh per request (not module-level singleton),
 * because it captures the request's cookies().
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component (not a Server Action /
            // Route Handler) -- cookies can't be written there. Safe to
            // ignore as long as middleware.ts is refreshing the session.
          }
        },
      },
    }
  );
}

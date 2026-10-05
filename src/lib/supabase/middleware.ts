import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request. This replaces the
 * old app's custom window.__smfWithFreshToken() bridge -- @supabase/ssr
 * handles token refresh and cookie sync for us, so every Server Component
 * and Route Handler always sees a valid session without any bespoke code.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not remove. Refreshing the session (getUser, not
  // getSession) is what actually revalidates the token against Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage =
    request.nextUrl.pathname.startsWith("/sign-in") ||
    request.nextUrl.pathname.startsWith("/sign-up") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/update-password") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    // Email unsubscribe links must work without signing in.
    request.nextUrl.pathname.startsWith("/api/unsubscribe") ||
    // Gig integration webhooks (Printful, Shopify) carry their own token / HMAC.
    request.nextUrl.pathname.startsWith("/api/webhooks/") ||
    request.nextUrl.pathname.startsWith("/unsubscribed");

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // Two-factor step-up (server-side, before any page renders): a member who
  // has an authenticator set up but hasn't entered the 6-digit code this
  // session (AAL1 while AAL2 is available) is held at /sign-in?mfa=1 for
  // every page, and API routes get a 401. A password alone never gets in.
  if (user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = aal?.nextLevel === "aal2" && aal?.currentLevel !== "aal2";
    if (needsMfa) {
      const path = request.nextUrl.pathname;
      const allowed =
        path.startsWith("/sign-in") ||
        path.startsWith("/auth/signout") ||
        path.startsWith("/api/unsubscribe") ||
        path.startsWith("/unsubscribed");
      if (!allowed) {
        if (path.startsWith("/api/")) {
          return NextResponse.json({ error: "Two-factor verification required." }, { status: 401 });
        }
        const url = request.nextUrl.clone();
        url.pathname = "/sign-in";
        url.search = "?mfa=1";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }
  }

  // A signed-in user landing on Sign In/Sign Up/Forgot Password is almost
  // always a stale-session mixup -- a previous account left logged in on
  // this browser, then someone types a *different* account's credentials
  // expecting a fresh login. If that new attempt fails, the old session
  // was never cleared, so they land back on their own already-logged-in
  // dashboard and can easily mistake it for "the wrong password let me
  // in" (it's really just the account they were already signed into).
  // Bouncing straight to the dashboard instead makes an active session
  // impossible to miss, so switching accounts always starts with an
  // explicit Sign Out. /update-password and /auth/confirm are exempt --
  // the password-reset and email-confirmation links intentionally sign
  // the user in (often as themselves) in order to land here.
  const isSwitchableAuthPage =
    request.nextUrl.pathname.startsWith("/sign-in") ||
    request.nextUrl.pathname.startsWith("/sign-up") ||
    request.nextUrl.pathname.startsWith("/forgot-password");

  if (user && isSwitchableAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

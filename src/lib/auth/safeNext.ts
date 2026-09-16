// `next` is a plain, attacker-observable query param that ends up as a
// redirect target (or an in-page CTA href) -- restrict it to an in-app
// relative path so it can never become an open redirect. Shared by the
// /auth/confirm route and the /auth/confirmed landing page, since both
// accept `next` straight off the URL.
export function safeNext(next: string | null | undefined): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safeNext";

// Types where "verified" is itself the news worth telling the user about --
// these land on /auth/confirmed (a "You're confirmed!" style acknowledgement)
// instead of going straight to `next`. Magic link ("magiclink"/"email") and
// password recovery ("recovery") skip it: those destinations (dashboard,
// update-password) already make it obvious the link worked.
const CONFIRMATION_ACK_TYPES = new Set(["signup", "invite", "email_change"]);

// Handles the confirmation link from every Supabase auth email (confirm
// signup, magic link, password recovery, email change, invite). Supabase's
// one-time tokens are single-use, and a GET here used to call verifyOtp
// immediately -- which is exactly what makes "the link expires instantly"
// happen: email security scanners (Outlook Safe Links, corporate email
// gateways, antivirus/link-prefetchers, some webmail providers) issue a
// plain GET against every link in an email the moment it arrives, well
// before a person actually clicks it, silently burning the token. By the
// time the real user clicks, Supabase reports it as already used/expired.
//
// The fix (Supabase's own documented mitigation for this exact issue):
// GET no longer verifies anything -- it only renders a small interstitial
// with a "Continue" button. Only the POST from that button's form actually
// calls verifyOtp. Scanners follow links but essentially never submit
// forms or run JS to click a button, so the token survives until a real
// person acts on it.
//
// Email templates must link here with `token_hash`/`type` taken directly
// from Supabase's `{{ .TokenHash }}`/`{{ .SiteURL }}` template variables --
// NOT `{{ .ConfirmationURL }}`, which routes through Supabase's OWN hosted
// verify endpoint first (a second GET-verifies-instantly hop with the
// identical scanner problem, one step earlier). See the
// claude/*-email-template.html project docs.
function typeLabel(type: string | null): string {
  switch (type) {
    case "recovery":
      return "Reset your password";
    case "signup":
      return "Confirm your email";
    case "invite":
      return "Accept your invitation";
    case "email_change":
      return "Confirm your new email";
    case "magiclink":
    case "email":
      return "Sign in";
    default:
      return "Continue";
  }
}

// Minimal attribute-value escaping -- these values are reflected into
// hidden form fields below, and while token_hash/type only ever come from
// Supabase's own outbound email links, `next` is attacker-observable
// (it's a plain query param), so this stays defensive either way.
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInterstitial(params: { token_hash: string; type: string; next: string }) {
  const label = typeLabel(params.type);
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${label} — Sticky Monkey Finance</title>
    <style>
      body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
             background:hsla(222,33%,9%,1); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
      .card { width:100%; max-width:380px; margin:16px; border-radius:16px; padding:28px;
              background:hsla(221.05,31.15%,11.96%,1); border:1px solid hsla(220,20%,20%,1); text-align:center; box-sizing:border-box; }
      .brand { margin:0 0 18px; font-size:14px; font-weight:600; color:hsla(240,15.15%,93.53%,1); }
      h1 { margin:0 0 8px; font-size:16px; font-weight:600; color:hsla(240,15.15%,93.53%,1); }
      p { margin:0 0 20px; font-size:13px; line-height:1.6; color:hsla(223.9,28.67%,71.96%,1); }
      button { width:100%; padding:12px; border:0; border-radius:10px; font-size:14px; font-weight:600;
               color:#ffffff; background:#4f8cff; cursor:pointer; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand">Sticky Monkey Finance</div>
      <h1>${label}</h1>
      <p>Click below to finish. This extra step keeps email security scanners from using up your link before you do.</p>
      <form method="post">
        <input type="hidden" name="token_hash" value="${escapeAttr(params.token_hash)}" />
        <input type="hidden" name="type" value="${escapeAttr(params.type)}" />
        <input type="hidden" name="next" value="${escapeAttr(params.next)}" />
        <button type="submit">Continue</button>
      </form>
    </div>
  </body>
</html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
  }

  return renderInterstitial({ token_hash, type, next });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const token_hash = formData.get("token_hash");
  const type = formData.get("type");
  const next = safeNext(formData.get("next") as string | null);

  if (typeof token_hash === "string" && token_hash && typeof type === "string" && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash });
    if (!error) {
      // 303, not the default 307: NextResponse.redirect() defaults to a
      // redirect status that preserves the original request method, and
      // this handler is itself a POST (the interstitial's "Continue" button
      // submits a form). A 307/308 here makes the browser re-issue the
      // redirect to `next` as a POST too, which every destination page
      // (e.g. /update-password) only serves via GET -- producing a
      // confusing 405 right after a successful verification. 303 forces
      // the follow-up request to be a GET regardless of the original method.
      const destination = CONFIRMATION_ACK_TYPES.has(type)
        ? `/auth/confirmed?type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`
        : next;
      return NextResponse.redirect(new URL(destination, request.url), 303);
    }
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", request.url), 303);
}

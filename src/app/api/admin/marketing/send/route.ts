import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderMarketingEmail } from "@/lib/marketing/email";
import { directorAal2Error } from "@/lib/auth/mfaGuard";

// App Director only: sends a marketing email to members who opted in
// (profiles.marketing_opt_in) via Resend's batch API.
//
// Server env (Vercel, no NEXT_PUBLIC_ prefix):
//   RESEND_API_KEY            Resend API key (free tier: 3,000/mo, 100/day)
//   MARKETING_FROM_EMAIL      e.g. "Sticky Monkey <news@stickymonkey.net>" (domain verified in Resend)
//   MARKETING_POSTAL_ADDRESS  mailing address for the footer (CAN-SPAM)
//   MARKETING_DAILY_CAP       optional, default 100 (Resend free-tier daily limit)

type Body = { subject?: string; body?: string; ctaLabel?: string; ctaUrl?: string; mode?: "test" | "all" };
type Recipient = { email: string; name: string | null; token: string };

const BATCH = 100;

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function handle(request: Request): Promise<NextResponse> {
  let input: Body;
  try {
    input = (await request.json()) as Body;
  } catch {
    return bad("Invalid request body");
  }
  const subject = (input.subject ?? "").trim();
  const body = (input.body ?? "").trim();
  const ctaLabel = (input.ctaLabel ?? "").trim();
  const ctaUrl = (input.ctaUrl ?? "").trim();
  const mode = input.mode === "all" ? "all" : "test";
  if (!subject || subject.length > 150) return bad("Subject is required (150 characters max).");
  if (!body || body.length > 20000) return bad("Message is required.");
  if (ctaUrl && !/^https:\/\/\S+$/.test(ctaUrl)) return bad("Button link must start with https://");

  // Caller must be App Director (checked server-side; service role is used below).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Not signed in", 401);
  const { data: me } = await supabase.from("profiles").select("role,email,name,marketing_unsub_token").eq("id", user.id).maybeSingle();
  if (me?.role !== "app_director") return bad("Not authorized.", 403);
  const mfaErr = await directorAal2Error(supabase);
  if (mfaErr) return bad(mfaErr, 403);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MARKETING_FROM_EMAIL;
  const postal = process.env.MARKETING_POSTAL_ADDRESS;
  if (!apiKey || !from || !postal) {
    return bad("Email isn't set up yet. Add RESEND_API_KEY, MARKETING_FROM_EMAIL and MARKETING_POSTAL_ADDRESS in Vercel, then redeploy.", 500);
  }
  const dailyCap = Number(process.env.MARKETING_DAILY_CAP) || 100;

  // Recipients.
  let recipients: Recipient[] = [];
  if (mode === "test") {
    const email = me.email || user.email;
    if (!email) return bad("Your profile has no email address.");
    recipients = [{ email, name: me.name ?? null, token: me.marketing_unsub_token }];
  } else {
    const admin = createAdminClient();
    for (let offset = 0; offset < 50000; offset += 1000) {
      const { data, error } = await admin
        .from("profiles")
        .select("email,name,marketing_unsub_token")
        .eq("marketing_opt_in", true)
        .eq("is_demo", false)
        .not("email", "is", null)
        .order("id")
        .range(offset, offset + 999);
      if (error) return bad(`Couldn't load recipients: ${error.message}`, 500);
      for (const r of data ?? []) if (r.email) recipients.push({ email: r.email, name: r.name, token: r.marketing_unsub_token });
      if (!data || data.length < 1000) break;
    }
    if (!recipients.length) return bad("No members have opted in to email updates yet.");
  }

  // Daily cap (Resend free tier), counted from today's sends (UTC).
  const today = new Date().toISOString().slice(0, 10);
  const { data: sentToday } = await supabase
    .from("marketing_campaigns")
    .select("recipients")
    .eq("channel", "email")
    .eq("status", "sent")
    .gte("sent_at", `${today}T00:00:00Z`);
  const used = (sentToday ?? []).reduce((s, r) => s + (Number(r.recipients) || 0), 0);
  if (used + recipients.length > dailyCap) {
    return bad(`Daily limit: ${dailyCap - used} of ${dailyCap} emails left today, this send needs ${recipients.length}. Try again tomorrow or raise MARKETING_DAILY_CAP after upgrading Resend.`);
  }

  const origin = new URL(request.url).origin;
  let sent = 0;
  const errors: string[] = [];
  for (let i = 0; i < recipients.length; i += BATCH) {
    const payload = recipients.slice(i, i + BATCH).map((r) => {
      const unsubscribeUrl = `${origin}/api/unsubscribe?t=${encodeURIComponent(r.token)}`;
      const { html, text } = renderMarketingEmail({
        subject,
        body,
        ctaLabel: ctaLabel || undefined,
        ctaUrl: ctaUrl || undefined,
        name: r.name,
        unsubscribeUrl,
        postalAddress: postal,
      });
      return {
        from,
        to: [r.email],
        subject: mode === "test" ? `[Test] ${subject}` : subject,
        html,
        text,
        headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
      };
    });
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        errors.push(j?.message || `Resend error ${res.status}`);
      } else sent += payload.length;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Network error");
    }
  }

  // Log (tests are logged too so they count toward the daily cap).
  await supabase.from("marketing_campaigns").insert({
    channel: "email",
    subject: mode === "test" ? `[Test] ${subject}` : subject,
    body,
    link: ctaUrl || null,
    status: sent > 0 ? "sent" : "failed",
    recipients: sent,
    error: errors.length ? errors.join("; ").slice(0, 500) : null,
    sent_at: new Date().toISOString(),
  });

  if (!sent) return bad(errors[0] || "Nothing was sent.", 502);
  return NextResponse.json({ sent, failed: recipients.length - sent, error: errors[0] ?? null });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Unexpected error", 500);
  }
}

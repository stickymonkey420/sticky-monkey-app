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

// mode: "test" (just you), "all" (opted-in members), "invitees" (invite list:
// people not signed up yet; optional inviteeIds limits it to a selection).
type Body = { subject?: string; body?: string; ctaLabel?: string; ctaUrl?: string; mode?: "test" | "all" | "invitees"; inviteeIds?: string[]; testAudience?: "members" | "invitees" };
type Recipient = { email: string; name: string | null; token: string; inviteeId?: string; joinUrl?: string };
type Admin = ReturnType<typeof createAdminClient>;

// Personal one-time join link for an invitee (invite-only beta: public
// sign-up is off in Supabase, so this is the only way in). generateLink()
// creates the unconfirmed auth user (handle_new_user fills profiles.name)
// and returns the hashed token WITHOUT Supabase sending its own email; the
// link goes through our /auth/confirm interstitial (scanner-safe) and on to
// /update-password, then the mandatory onboarding survey. Re-sending to
// someone who was already invited but never accepted issues a fresh link.
async function joinLink(admin: Admin, origin: string, email: string, name: string | null, invitedBy: string): Promise<string> {
  const data = { name: name || undefined, invited_by: invitedBy };
  let res = await admin.auth.admin.generateLink({ type: "invite", email, options: { data } });
  let type = "invite";
  if (res.error && /already|registered|exists/i.test(res.error.message)) {
    // Account exists but was never confirmed: a magic link signs them in
    // (and confirms the email) the same one-time way.
    res = await admin.auth.admin.generateLink({ type: "magiclink", email });
    type = "magiclink";
  }
  const hash = res.data?.properties?.hashed_token;
  if (res.error || !hash) throw new Error(res.error?.message || "no link returned");
  const q = new URLSearchParams({ token_hash: hash, type, next: "/update-password" });
  return `${origin}/auth/confirm?${q.toString()}`;
}

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
  const mode = input.mode === "all" || input.mode === "invitees" ? input.mode : "test";
  const audience = mode === "invitees" || (mode === "test" && input.testAudience === "invitees") ? "invitees" : "members";
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
  } else if (mode === "invitees") {
    const admin = createAdminClient();
    // Anyone on the list who has actually joined (confirmed / signed in) is
    // marked joined and skipped. Invited-but-not-accepted accounts exist in
    // auth too (the join link creates them), so a bare "has a profile"
    // check would wrongly skip them on a re-send.
    const members = new Set<string>();
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return bad(`Couldn't check who has joined: ${error.message}`, 500);
      for (const u of data.users) if (u.email && (u.email_confirmed_at || u.last_sign_in_at)) members.add(u.email.toLowerCase());
      if (data.users.length < 1000) break;
    }
    let q = admin.from("marketing_invitees").select("id,email,name,unsub_token,status").in("status", ["pending", "invited"]);
    const ids = Array.isArray(input.inviteeIds) ? input.inviteeIds.filter((x) => typeof x === "string").slice(0, 1000) : [];
    if (ids.length) q = q.in("id", ids);
    const { data: rows, error } = await q;
    if (error) return bad(`Couldn't load the invite list: ${error.message}`, 500);
    const joined: string[] = [];
    for (const r of rows ?? []) {
      if (members.has(String(r.email).toLowerCase())) joined.push(r.id);
      else recipients.push({ email: r.email, name: r.name, token: r.unsub_token, inviteeId: r.id });
    }
    if (joined.length) await admin.from("marketing_invitees").update({ status: "joined" }).in("id", joined);
    if (!recipients.length) return bad("No one left to invite (everyone selected has joined or unsubscribed).");
    // Each invitee's button becomes their own one-time join link.
    const origin = new URL(request.url).origin;
    const linkErrors: string[] = [];
    const withLinks: Recipient[] = [];
    for (const r of recipients) {
      try {
        withLinks.push({ ...r, joinUrl: await joinLink(admin, origin, r.email, r.name, user.id) });
      } catch (e) {
        linkErrors.push(`${r.email}: ${e instanceof Error ? e.message : "link failed"}`);
      }
    }
    if (!withLinks.length) return bad(`Couldn't create join links. ${linkErrors[0] ?? ""}`.trim(), 500);
    recipients = withLinks;
    if (linkErrors.length) console.error("join link errors", linkErrors.join("; "));
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
        ctaLabel: r.joinUrl ? ctaLabel || "Join as a founding member" : ctaLabel || undefined,
        ctaUrl: r.joinUrl || ctaUrl || undefined,
        name: r.name,
        unsubscribeUrl,
        postalAddress: postal,
        audience,
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
      } else {
        sent += payload.length;
        if (mode === "invitees") {
          const batchIds = recipients.slice(i, i + BATCH).map((r) => r.inviteeId).filter(Boolean) as string[];
          const admin = createAdminClient();
          const { data: cur } = await admin.from("marketing_invitees").select("id,invite_count").in("id", batchIds);
          const now = new Date().toISOString();
          for (const r of cur ?? []) await admin.from("marketing_invitees").update({ status: "invited", invited_at: now, invite_count: (r.invite_count ?? 0) + 1 }).eq("id", r.id);
        }
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Network error");
    }
  }

  // Log (tests are logged too so they count toward the daily cap).
  await supabase.from("marketing_campaigns").insert({
    channel: "email",
    subject: mode === "test" ? `[Test] ${subject}` : mode === "invitees" ? `[Invite] ${subject}` : subject,
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

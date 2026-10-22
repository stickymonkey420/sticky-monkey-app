import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Health > Medical > Request a quote: the app emails the fillable quote PDF to
// one of the member's own saved clinics. The message is in the email body
// (not pasted under a signature), the PDF is attached, replies go to the
// member (reply_to) and the member gets a copy (cc).
//
// Guard rails (it sends to outside addresses): signed-in member with Health
// access; recipient must be the email saved on that member's own clinic (no
// free-typed addresses); PDF only, 3 MB max; 10 sends per member per day.
// Uses the existing Resend setup: RESEND_API_KEY + MARKETING_FROM_EMAIL
// (verified stickymonkey.net sender). Free tier: 3,000/mo, 100/day. $0.

type Body = { providerId?: string; subject?: string; message?: string; fileName?: string; pdfBase64?: string; items?: number };

const DAILY_LIMIT = 10;
const MAX_PDF_BYTES = 3 * 1024 * 1024;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function handle(request: Request): Promise<NextResponse> {
  let input: Body;
  try {
    input = (await request.json()) as Body;
  } catch {
    return bad("Invalid request body");
  }
  const subject = (input.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 150);
  const message = (input.message ?? "").trim();
  const fileName = (input.fileName ?? "Quote-request.pdf").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 100);
  const pdf = (input.pdfBase64 ?? "").replace(/^data:application\/pdf;base64,/, "");
  if (!input.providerId) return bad("Pick a clinic.");
  if (!subject) return bad("Subject is required.");
  if (!message || message.length > 5000) return bad("Message is required (5,000 characters max).");
  if (!pdf || !/^[A-Za-z0-9+/=]+$/.test(pdf)) return bad("The PDF is missing.");
  const bytes = Math.floor((pdf.length * 3) / 4);
  if (bytes > MAX_PDF_BYTES) return bad("The PDF is too large to send.");
  if (!Buffer.from(pdf.slice(0, 8), "base64").toString("latin1").startsWith("%PDF")) return bad("Only PDF attachments can be sent.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Not signed in", 401);
  const { data: allowed } = await supabase.rpc("health_access");
  if (allowed !== true) return bad("Not authorized.", 403);

  // Recipient comes from the member's own clinic record (RLS-scoped), never from the request.
  const { data: clinic } = await supabase.from("medical_providers").select("id,name,email").eq("id", input.providerId).eq("user_id", user.id).maybeSingle();
  if (!clinic) return bad("Clinic not found.", 404);
  const to = (clinic.email ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return bad("Add this clinic's email first (Clinics › tap the clinic).");

  const { data: prof } = await supabase.from("profiles").select("name,email,is_demo").eq("id", user.id).maybeSingle();
  if (prof?.is_demo) return bad("Demo accounts can't send email. Use Download PDF instead.", 403);
  const replyTo = (prof?.email || user.email || "").trim();
  if (!replyTo) return bad("Your profile has no email address for the clinic to reply to.");
  const name = (prof?.name || "").trim() || replyTo;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin.from("medical_quote_sends").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("sent_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return bad(`You've sent ${DAILY_LIMIT} quote requests in the last 24 hours. Try again tomorrow.`, 429);

  const apiKey = process.env.RESEND_API_KEY;
  const fromEnv = process.env.QUOTE_FROM_EMAIL || process.env.MARKETING_FROM_EMAIL;
  if (!apiKey || !fromEnv) return bad("Email isn't set up yet (RESEND_API_KEY and MARKETING_FROM_EMAIL in Vercel). Use Download PDF for now.", 500);
  const fromAddr = (fromEnv.match(/<([^>]+)>/)?.[1] ?? fromEnv).trim();
  const display = `${name.replace(/["<>\r\n]/g, "").slice(0, 60)} via Sticky Monkey`;

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#14213d">` +
    message
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
      .join("") +
    `<p style="margin:18px 0 0;font-size:12px;color:#6a7179">Please reply to this email (it goes to ${esc(replyTo)}). The attached PDF is fillable: type the brand and price for each item, save it and attach it to your reply.</p>` +
    `</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${display} <${fromAddr}>`,
      to: [to],
      cc: [replyTo],
      reply_to: replyTo,
      subject,
      text: message,
      html,
      attachments: [{ filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`, content: pdf }],
    }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { message?: string } | null;
    return bad(j?.message || `Email service error ${res.status}`, 502);
  }

  await admin.from("medical_quote_sends").insert({ user_id: user.id, provider_id: clinic.id, to_email: to, items: Math.max(0, Math.min(500, Number(input.items) || 0)) });
  return NextResponse.json({ sent: true, to, cc: replyTo });
}

export async function POST(request: Request) {
  try {
    return await handle(request);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Unexpected error", 500);
  }
}

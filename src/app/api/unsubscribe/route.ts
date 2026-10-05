import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Marketing email unsubscribe (public, no sign-in).
//  GET  -> sends the reader to /unsubscribed to confirm with a button (link
//          scanners that prefetch GET can't unsubscribe anyone by accident).
//  POST -> unsubscribes. Used by that button and by mail apps' one-click
//          unsubscribe (List-Unsubscribe-Post, RFC 8058).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const t = url.searchParams.get("t") ?? "";
  const dest = new URL("/unsubscribed", url.origin);
  if (UUID.test(t)) dest.searchParams.set("t", t);
  return NextResponse.redirect(dest);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let t = url.searchParams.get("t") ?? "";
  if (!t) {
    const body = (await request.json().catch(() => null)) as { t?: string } | null;
    t = body?.t ?? "";
  }
  if (!UUID.test(t)) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  try {
    const admin = createAdminClient();
    const [{ error }, { error: invErr }] = await Promise.all([
      admin.from("profiles").update({ marketing_opt_in: false }).eq("marketing_unsub_token", t),
      // People on the invite list (not members yet) unsubscribe the same way.
      admin.from("marketing_invitees").update({ status: "unsubscribed" }).eq("unsub_token", t),
    ]);
    if (error || invErr) return NextResponse.json({ error: "Couldn't unsubscribe. Try again." }, { status: 500 });
  } catch {
    return NextResponse.json({ error: "Couldn't unsubscribe. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

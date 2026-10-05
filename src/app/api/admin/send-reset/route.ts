import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { directorAal2Error } from "@/lib/auth/mfaGuard";

// Users & Groups "Send password reset" (App Director / Support / Developer).
// Runs server-side with the service role so it keeps working once CAPTCHA is
// required on the public auth endpoints (the service role isn't challenged).
const ALLOWED = new Set(["app_director", "support", "developer"]);

export async function POST(request: Request) {
  try {
    const { email } = ((await request.json().catch(() => ({}))) ?? {}) as { email?: string };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!me?.role || !ALLOWED.has(me.role)) return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    if (me.role === "app_director") {
      const mfaErr = await directorAal2Error(supabase);
      if (mfaErr) return NextResponse.json({ error: mfaErr }, { status: 403 });
    }

    const origin = new URL(request.url).origin;
    const { error } = await createAdminClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/confirm?next=/update-password`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}

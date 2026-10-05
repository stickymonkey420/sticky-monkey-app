import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// App Director only: the non-secret email settings the Marketing preview
// needs to look exactly like the sent email (From line, footer address).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "app_director") return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  return NextResponse.json({
    from: process.env.MARKETING_FROM_EMAIL ?? null,
    postal: process.env.MARKETING_POSTAL_ADDRESS ?? null,
    ready: !!(process.env.RESEND_API_KEY && process.env.MARKETING_FROM_EMAIL && process.env.MARKETING_POSTAL_ADDRESS),
  });
}

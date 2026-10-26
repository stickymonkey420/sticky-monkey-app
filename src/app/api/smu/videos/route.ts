import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { r2Configured, signedPlayUrl } from "@/lib/smu/r2";
import type { SmuVideo } from "@/lib/smu/types";

// SMU lesson list for any signed-in member, each with a short-lived signed
// play link. RLS hides unpublished videos from everyone but the App Director.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("smu_videos")
    .select("id,title,description,section,sort_order,r2_key,size_bytes,duration_sec,published,version,updated_at")
    .order("section")
    .order("sort_order")
    .order("title");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const configured = r2Configured();
  const videos = await Promise.all(
    ((data ?? []) as SmuVideo[]).map(async (v) => ({ ...v, url: configured ? await signedPlayUrl(v.r2_key) : null })),
  );
  return NextResponse.json({ videos, configured }, { headers: { "Cache-Control": "private, no-store" } });
}

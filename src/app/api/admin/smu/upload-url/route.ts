import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signedUploadUrl } from "@/lib/smu/r2";

// App Director only: a 15-minute signed PUT link so the browser uploads the
// video straight to R2. Each upload gets a fresh key (slug + timestamp), so a
// replaced video never shows a stale cached copy.
const MAX_BYTES = 300 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "app_director") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  let body: { filename?: string; contentType?: string; size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const contentType = String(body.contentType || "");
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(contentType)) {
    return NextResponse.json({ error: "Use an MP4, MOV or WebM video." }, { status: 400 });
  }
  if (!(Number(body.size) > 0) || Number(body.size) > MAX_BYTES) {
    return NextResponse.json({ error: "Videos must be under 300 MB. Compress it first." }, { status: 400 });
  }
  const ext = contentType === "video/webm" ? "webm" : contentType === "video/quicktime" ? "mov" : "mp4";
  const slug =
    String(body.filename || "video")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "video";
  const key = `smu/${slug}-${Date.now().toString(36)}.${ext}`;
  try {
    return NextResponse.json({ key, url: await signedUploadUrl(key, contentType) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload unavailable" }, { status: 503 });
  }
}

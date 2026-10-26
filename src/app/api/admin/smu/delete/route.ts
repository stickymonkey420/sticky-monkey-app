import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteObject } from "@/lib/smu/r2";

// App Director only: removes an R2 object. Called after a video is replaced
// (old file) or deleted (row + file). Only keys under smu/ can be removed.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "app_director") return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  let key = "";
  try {
    key = String(((await request.json()) as { key?: string }).key || "");
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!/^smu\/[a-z0-9][a-z0-9._/-]{1,180}$/.test(key) || key.includes("..")) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  try {
    await deleteObject(key);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Delete failed" }, { status: 500 });
  }
}

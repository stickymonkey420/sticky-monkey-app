"use client";

import { useEffect, useState } from "react";
import { Plane } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Travel -- App Director only for now.
// Placeholder until the feature details are defined.
export default function TravelPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
      if (cancelled) return;
      setAllowed(data?.role === "app_director");
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[21px] font-semibold text-text-primary">Travel</h1>
      </div>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : !allowed ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Your account doesn&apos;t have access to this page.</div>
      ) : (
        <div className="flex flex-col items-center rounded-2xl border border-card-border bg-card-bg px-6 py-12 text-center">
          <Plane size={36} className="text-[#4f8cff]" />
          <div className="mt-3 text-base font-semibold text-text-primary">Coming soon</div>
          <p className="mt-1 max-w-md text-sm text-text-muted">This is where your travel planning will live. Features are being set up.</p>
        </div>
      )}
    </>
  );
}

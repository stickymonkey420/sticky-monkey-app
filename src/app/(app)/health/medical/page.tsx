"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MedicalDashboard from "@/components/medical/MedicalDashboard";

// Health > Medical -- App Director only for now (demo accounts later).
// Vaccines, preventive checks and clinics follow-up dashboard.
export default function MedicalPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
      if (cancelled) return;
      setUserId(data?.role === "app_director" && user ? user.id : null);
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
        <h1 className="text-[21px] font-semibold text-text-primary">Medical</h1>
      </div>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : !userId ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Your account doesn&apos;t have access to this page.</div>
      ) : (
        <MedicalDashboard userId={userId} />
      )}
    </>
  );
}

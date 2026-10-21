"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MedicalDashboard from "@/components/medical/MedicalDashboard";

// Health > Medical -- App Director + demo accounts (same health_access() gate
// as Health and the medical_* RLS policies).
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
      const { data: allowed } = user ? await supabase.rpc("health_access") : { data: false };
      if (cancelled) return;
      setUserId(allowed === true && user ? user.id : null);
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

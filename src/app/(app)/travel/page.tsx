"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TravelDashboard from "@/components/travel/TravelDashboard";

// Travel -- App Director only for now (same check as the travel_* RLS
// policies: travel_access()). Trips, budgets, care-abroad comparison, documents.
export default function TravelPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: allowed } = user ? await supabase.rpc("travel_access") : { data: false };
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
        <h1 className="text-[21px] font-semibold text-text-primary">Travel</h1>
      </div>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : !userId ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Your account doesn&apos;t have access to this page.</div>
      ) : (
        <TravelDashboard userId={userId} />
      )}
    </>
  );
}

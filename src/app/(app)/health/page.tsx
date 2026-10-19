"use client";

import { useEffect, useState } from "react";
import HealthTracker from "@/components/health/HealthTracker";
import { createClient } from "@/lib/supabase/client";
import { fetchMyRole } from "@/lib/usersGroups/queries";

// App Director only (nav: below Marketing). Calories in (photo AI estimate or
// manual) vs calories out (resting baseline + exercise). RLS on the health_*
// tables, the private health-photos bucket and the health-food-estimate edge
// function all enforce app_director.
export default function HealthPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const role = user ? await fetchMyRole(supabase, user.id) : null;
      if (cancelled) return;
      setUserId(role === "app_director" && user ? user.id : null);
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
        <h1 className="text-[21px] font-semibold text-text-primary">Health</h1>
      </div>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : !userId ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Your account doesn&apos;t have access to this page.</div>
      ) : (
        <HealthTracker userId={userId} />
      )}
    </>
  );
}

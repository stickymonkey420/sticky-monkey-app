"use client";

import { useEffect, useState } from "react";
import MarketingTool from "@/components/marketing/MarketingTool";
import { createClient } from "@/lib/supabase/client";
import { fetchMyRole } from "@/lib/usersGroups/queries";

// App Director only (nav: below Feedback). Emails go only to members who
// opted in; social posts launch each platform's own composer ($0, no APIs).
// RLS on marketing_campaigns and the send API both enforce app_director.
export default function MarketingPage() {
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  function showStatus(text: string, isError: boolean) {
    setStatus({ text, isError });
    setTimeout(() => setStatus((s) => (s?.text === text ? null : s)), 5000);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const role = user ? await fetchMyRole(supabase, user.id) : null;
      if (cancelled) return;
      setDenied(role !== "app_director");
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Marketing</h1>
        {status && (
          <span className="text-sm" style={{ color: status.isError ? "#e05656" : "#f5d020" }}>
            {status.text}
          </span>
        )}
      </div>
      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : denied ? (
        <div className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-text-muted">Your account doesn&apos;t have access to this page.</div>
      ) : (
        <MarketingTool onStatus={showStatus} />
      )}
    </>
  );
}

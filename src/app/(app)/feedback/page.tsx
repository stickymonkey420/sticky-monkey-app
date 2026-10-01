"use client";

import { useEffect, useState } from "react";
import FeedbackAdmin from "@/components/feedback/FeedbackAdmin";
import { createClient } from "@/lib/supabase/client";
import { fetchMyRole, fetchProfiles } from "@/lib/usersGroups/queries";
import type { Profile } from "@/lib/usersGroups/types";

// App Director triage page for business / gig feedback (nav: below Users &
// Groups). RLS on business_feedback returns every row only to app_director.
export default function FeedbackPage() {
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  function showStatus(text: string, isError: boolean) {
    setStatus({ text, isError });
    setTimeout(() => setStatus((s) => (s?.text === text ? null : s)), 4000);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const role = user ? await fetchMyRole(supabase, user.id) : null;
      if (cancelled) return;
      if (role !== "app_director") {
        setDenied(true);
        setLoading(false);
        return;
      }
      const rows = await fetchProfiles(supabase);
      if (cancelled) return;
      setPeople(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[21px] font-semibold text-text-primary">Feedback</h1>
        {status && (
          <span className="text-sm" style={{ color: status.isError ? "#e05656" : "#f5d020" }}>
            {status.text}
          </span>
        )}
      </div>
      <div className="rounded-2xl border border-card-border bg-card-bg p-5">
        {loading ? (
          <div className="text-sm text-text-muted">Loading…</div>
        ) : denied ? (
          <div className="text-sm text-text-muted">Your account doesn&apos;t have access to this page.</div>
        ) : (
          <FeedbackAdmin people={people} onStatus={showStatus} />
        )}
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/ConfirmProvider";

// Consumer health data consent (Nevada SB 370 / Washington My Health My Data).
// Shown once, the first time a member opens Health or Medical; recorded in
// health_consents. Demo accounts skip it (their health data is fictional and
// reset on every sign-in). Withdrawing consent blocks Health again until the
// member re-agrees; deleting existing data is a separate request.
export const HEALTH_CONSENT_VERSION = "2026-10-21";

type State = "loading" | "needed" | "granted" | "demo";

export default function HealthConsentGate({ userId, children }: { userId: string; children: React.ReactNode }) {
  const confirm = useConfirm();
  const [state, setState] = useState<State>("loading");
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [{ data: prof }, { data: consent }] = await Promise.all([
        supabase.from("profiles").select("is_demo").eq("id", userId).maybeSingle(),
        supabase.from("health_consents").select("consented_at,withdrawn_at").eq("user_id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      if ((prof as { is_demo: boolean | null } | null)?.is_demo) setState("demo");
      else if (consent && !(consent as { withdrawn_at: string | null }).withdrawn_at) setState("granted");
      else setState("needed");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, reload]);

  async function giveConsent() {
    setSaving(true);
    setError(null);
    const { error: err } = await createClient()
      .from("health_consents")
      .upsert(
        {
          user_id: userId,
          version: HEALTH_CONSENT_VERSION,
          consented_at: new Date().toISOString(),
          withdrawn_at: null,
          user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: "user_id" },
      );
    setSaving(false);
    if (err) setError(err.message);
    else setReload((n) => n + 1);
  }

  async function withdraw() {
    const ok = await confirm({
      title: "Withdraw health data consent?",
      message:
        "We'll stop collecting health data and Health will be locked until you agree again. Your existing entries stay unless you ask us to delete them at privacy@stickymonkey.net.",
      confirmLabel: "Withdraw",
      danger: true,
    });
    if (!ok) return;
    const { error: err } = await createClient()
      .from("health_consents")
      .update({ withdrawn_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (err) setError(err.message);
    else setReload((n) => n + 1);
  }

  if (state === "loading") return <div className="text-sm text-text-muted">Loading…</div>;

  if (state === "needed") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-card-border bg-card-bg p-6">
        <h2 className="text-lg font-semibold text-text-primary">Your health data, your call</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          Health and Medical store sensitive information you enter: meals and food photos, exercise, weight, body measurements, fasting,
          vaccines, health checks and clinics. We use it only to run these features for you.
        </p>
        <ul className="mt-3 ml-5 list-disc space-y-1 text-sm text-text-muted">
          <li>Only you can see it. We never sell or share it for advertising.</li>
          <li>Food photos are sent to our AI provider (Anthropic) only to estimate calories when you ask.</li>
          <li>Sticky Monkey is not a healthcare provider and this data is not covered by HIPAA.</li>
          <li>You can withdraw consent or ask us to delete your health data at any time.</li>
        </ul>
        <label className="mt-4 flex items-start gap-2.5 text-sm text-text-primary">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            I consent to Sticky Monkey collecting and processing my health data as described in the{" "}
            <Link href="/consumer-health-data" target="_blank" className="text-[#4f8cff] underline">
              Consumer Health Data Privacy Policy
            </Link>
            .
          </span>
        </label>
        {error && <div className="mt-3 text-sm text-[#ff5c7a]">{error}</div>}
        <button
          type="button"
          disabled={!agree || saving}
          onClick={giveConsent}
          className="mt-4 rounded-lg bg-[#3ddc97] px-4 py-2 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
        >
          {saving ? "Saving…" : "I agree — open Health"}
        </button>
      </div>
    );
  }

  return (
    <>
      {children}
      {state === "granted" && (
        <div className="mt-6 text-center text-[11px] text-text-muted">
          <Link href="/consumer-health-data" className="hover:text-text-primary">
            Consumer Health Data Privacy Policy
          </Link>
          {" · "}
          <button type="button" onClick={withdraw} className="hover:text-text-primary">
            Withdraw health data consent
          </button>
          {error && <div className="mt-1 text-[#ff5c7a]">{error}</div>}
        </div>
      )}
    </>
  );
}

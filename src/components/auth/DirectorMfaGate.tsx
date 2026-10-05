"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Required two-factor (TOTP authenticator app) for App Director accounts.
// App Director can change roles, delete accounts and email members, so a
// stolen password alone must not be enough. Until this session is verified
// (AAL2) the app is covered by this screen:
//   - no authenticator yet -> set one up (scan QR, enter the 6-digit code)
//   - authenticator set up -> enter the current 6-digit code
// The admin API routes check AAL2 on the server too (lib/auth/mfaGuard.ts),
// and the middleware holds any member who HAS an authenticator at the sign-in
// code step before a page renders. This screen covers first-time setup, and
// AppShell hides the page content until it passes.
// Free on every Supabase plan (TOTP).

type Mode = "checking" | "ok" | "enroll" | "verify";

export default function DirectorMfaGate({ role, onPass }: { role: string | null; onPass: (ok: boolean) => void }) {
  const [mode, setMode] = useState<Mode>("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "app_director") return;
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      if (aal?.currentLevel === "aal2") {
        setMode("ok");
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const verified = factors?.totp?.[0];
      if (verified) {
        setFactorId(verified.id);
        setMode("verify");
        return;
      }
      // Clear any half-finished setup, then start a fresh one.
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Sticky Monkey authenticator" });
      if (cancelled) return;
      if (error || !enrolled) {
        setErr(error?.message || "Couldn't start two-factor setup.");
        setMode("enroll");
        return;
      }
      setFactorId(enrolled.id);
      setQr(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode("enroll");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [role]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || busy) return;
    setBusy(true);
    setErr(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      setErr("That code didn't work. Check your authenticator app and try again.");
      setCode("");
      return;
    }
    setMode("ok");
  }

  async function signOut() {
    await createClient().auth.signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/sign-in");
  }

  const passed = role !== null && (role !== "app_director" || mode === "ok");
  useEffect(() => {
    onPass(passed);
  }, [passed, onPass]);

  if (role !== "app_director" || mode === "ok") return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#0b0e15]/95 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-6 text-center">
        <div className="mb-1 text-lg font-semibold text-text-primary">Two-factor verification</div>
        {mode === "checking" ? (
          <p className="text-sm text-text-muted">Checking your session…</p>
        ) : (
          <>
            <p className="mb-4 text-sm text-text-muted">
              {mode === "enroll"
                ? "App Director accounts require an authenticator app. Scan this code with Google Authenticator, Microsoft Authenticator, 1Password or Authy, then enter the 6-digit code."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
            {mode === "enroll" && qr && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="Authenticator QR code" className="mx-auto mb-2 h-44 w-44 rounded-lg bg-white p-2" />
                {secret && (
                  <p className="mb-4 break-all text-xs text-text-muted">
                    Can&apos;t scan? Enter this key: <span className="font-mono text-text-primary">{secret}</span>
                  </p>
                )}
              </>
            )}
            <form onSubmit={verify} className="flex flex-col gap-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
                className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] text-text-primary outline-none focus:border-[#f5d020]/60"
              />
              <button
                type="submit"
                disabled={code.length !== 6 || busy || !factorId}
                className="rounded-lg bg-[#f5d020] py-2.5 text-sm font-semibold text-[#0f131c] disabled:opacity-40"
              >
                {busy ? "Verifying…" : mode === "enroll" ? "Turn on two-factor" : "Verify"}
              </button>
            </form>
            {err && <p className="mt-3 text-sm text-[#ff5c7a]">{err}</p>}
            <button type="button" onClick={signOut} className="mt-4 text-xs text-text-muted underline">
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
